using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Custom API: enmax_acdnCheckOutSheets (unbound).
    /// Inputs:
    /// - Sheets: EntityReferenceCollection OR comma-separated GUIDs
    /// - OR Drawing (+ optional AllAvailable=true) to resolve candidate sheets
    /// - Optional BatchId (string)
    /// </summary>
    public class CheckOutSheetsPlugin : PluginBase
    {
        internal const string SheetEntity = "enmax_autocadsheet";
        internal const string DrawingEntity = "enmax_autocaddrawing";
        internal const string CheckoutEntity = "enmax_autocadcheckout";
        internal const string AuditEntity = "enmax_autocadauditevent";

        internal const string ColSheetState = "enmax_acdnstate";
        internal const string ColSheetDrawing = "enmax_acdndrawing";
        internal const string ColCheckoutStatus = "enmax_acdnstatus";
        internal const string ColCheckoutDrawing = "enmax_acdndrawing";
        internal const string ColCheckoutSheet = "enmax_acdnsheet";
        internal const string ColCheckedOutBy = "enmax_acdncheckedoutby";
        internal const string ColCheckedOutOn = "enmax_acdncheckedouton";
        internal const string ColCheckoutName = "enmax_acdnname";
        internal const string ColBatchId = "enmax_acdnbatchid";

        internal const int SheetStateAvailable = 2;
        internal const int SheetStateCheckedOut = 3;

        internal const int CheckoutStatusOpen = 1;
        internal const int CheckoutStatusAwaitingValidation = 2;
        internal const int CheckoutStatusRequested = 6;

        private const int AuditEventStateChanged = 2;
        private const int AuditSourceAction = 4;

        private const int NotifSeverityInfo    = 1;
        private const int NotifSeverityWarning = 2;
        private const int NotifSourceSystem = 8;
        private const string CheckoutApprovalDeepLink = "/approvals?section=documents&tab=checkout";
        private const string MyItemsDeepLink = "/my-items";

        public CheckOutSheetsPlugin() : base(typeof(CheckOutSheetsPlugin)) { }

        public CheckOutSheetsPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(CheckOutSheetsPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;
            var actorId = PluginActor.ResolveForCustomApi(context, service);

            var sheetIds = ResolveSheetIds(service, context);
            if (sheetIds.Count == 0)
                throw new InvalidPluginExecutionException("No sheets were provided for checkout.");

            var checkoutIds = CheckoutSheets(localPluginContext, service, context, sheetIds, GetOptionalBatchId(context), actorId);
            context.OutputParameters["CheckoutIds"] = checkoutIds.Select(id => id.ToString()).ToArray();
        }

        internal static List<Guid> CheckoutSheets(
            ILocalPluginContext localPluginContext,
            IOrganizationService service,
            IPluginExecutionContext context,
            IEnumerable<Guid> sheetIds,
            string batchId,
            Guid actingUserId)
        {
            var checkoutIds = new List<Guid>();
            bool requireApproval = AppConfigReader.GetBoolDefaultTrue(service, "RequireCheckOutApproval");

            foreach (var sheetId in sheetIds.Distinct())
            {
                var sheet = service.Retrieve(SheetEntity, sheetId, new ColumnSet(
                    ColSheetState,
                    ColSheetDrawing,
                    "ownerid",
                    "enmax_acdnreservationtype",
                    "enmax_acdndocumentsubtype"));

                var drawingRef = sheet.GetAttributeValue<EntityReference>(ColSheetDrawing);
                if (drawingRef == null)
                    throw new InvalidPluginExecutionException($"Sheet {sheetId} has no parent drawing.");

                int sheetState = sheet.GetAttributeValue<OptionSetValue>(ColSheetState)?.Value ?? 0;
                if (sheetState != SheetStateAvailable)
                    throw new InvalidPluginExecutionException(
                        $"Sheet {sheetId} cannot be checked out from state {sheetState}. Expected {SheetStateAvailable} (Available).");

                Authorization.RequireOwnerOrAdmin(
                    service,
                    sheet.GetAttributeValue<EntityReference>("ownerid")?.Id ?? Guid.Empty,
                    actingUserId,
                    "check out this sheet");

                var reservationType = sheet.GetAttributeValue<OptionSetValue>("enmax_acdnreservationtype")?.Value;
                var documentSubtype = sheet.GetAttributeValue<OptionSetValue>("enmax_acdndocumentsubtype")?.Value;
                if (!AppConfigReader.TaxonomyCheckoutConfig.IsCheckoutEnabled(service, reservationType, documentSubtype))
                {
                    throw new InvalidPluginExecutionException(
                        $"Checkout is disabled by configuration for sheet {sheetId}.");
                }

                EnsureNoPendingOrActiveCheckout(service, sheetId);

                int checkoutStatus = requireApproval ? CheckoutStatusRequested : CheckoutStatusOpen;
                var checkout = new Entity(CheckoutEntity)
                {
                    [ColCheckoutStatus] = new OptionSetValue(checkoutStatus),
                    [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingRef.Id),
                    [ColCheckoutSheet] = new EntityReference(SheetEntity, sheetId),
                    [ColCheckedOutBy] = new EntityReference("systemuser", actingUserId),
                    [ColCheckedOutOn] = DateTime.UtcNow,
                    [ColCheckoutName] = string.Format(CultureInfo.InvariantCulture, "CHK-{0}", sheetId),
                    ["enmax_acdnnewrevision"] = string.Empty,
                    ["ownerid"] = new EntityReference("systemuser", actingUserId),
                };
                if (!string.IsNullOrWhiteSpace(batchId))
                    checkout[ColBatchId] = batchId;

                var checkoutId = service.Create(checkout);
                checkoutIds.Add(checkoutId);

                if (!requireApproval)
                {
                    service.Update(new Entity(SheetEntity, sheetId)
                    {
                        [ColSheetState] = new OptionSetValue(SheetStateCheckedOut),
                    });
                }

                int drawingState = DrawingRollupHelper.RecomputeDrawingRollup(service, drawingRef.Id);
                localPluginContext.Trace($"Checked out sheet {sheetId} checkout={checkoutId} drawingState={drawingState}");

                service.Create(new Entity(AuditEntity)
                {
                    ["enmax_acdnevent"] = new OptionSetValue(AuditEventStateChanged),
                    ["enmax_acdnsource"] = new OptionSetValue(AuditSourceAction),
                    ["enmax_acdnsubjectid"] = sheetId.ToString(),
                    ["enmax_acdnsubjecttable"] = SheetEntity,
                    ["enmax_acdnfromstate"] = "Available",
                    ["enmax_acdntostate"] = requireApproval ? "CheckoutRequested" : "CheckedOut",
                    ["enmax_acdnactedby"] = new EntityReference("systemuser", actingUserId),
                    ["enmax_acdnname"] = $"Sheet {sheetId} {(requireApproval ? "check out requested" : "checked out")}",
                });

                if (requireApproval)
                {
                    string number = NotificationWriter.ResolveDrawingNumber(service, drawingRef.Id);
                    string actor = NotificationWriter.ResolveActorName(service, actingUserId);
                    NotificationWriter.NotifyApproversAndAdmins(service, actingUserId,
                        title:        $"Check Out request: {number}",
                        body:         $"{actor} requested check-out for {number}. Review on the Approvals page.",
                        severity:     NotifSeverityWarning,
                        sourceEvent:  NotifSourceSystem,
                        subjectTable: CheckoutEntity,
                        subjectId:    checkoutId.ToString(),
                        deepLinkPath: CheckoutApprovalDeepLink);

                    NotificationWriter.Create(service, actingUserId,
                        title:        $"Check Out request submitted: {number}",
                        body:         $"Your check-out request for {number} was submitted and is pending approval.",
                        severity:     NotifSeverityInfo,
                        sourceEvent:  NotifSourceSystem,
                        subjectTable: CheckoutEntity,
                        subjectId:    checkoutId.ToString(),
                        deepLinkPath: MyItemsDeepLink);
                }
            }

            return checkoutIds;
        }

        private static string GetOptionalBatchId(IPluginExecutionContext context)
            => context.InputParameters.Contains("BatchId") ? context.InputParameters["BatchId"] as string : null;

        private static List<Guid> ResolveSheetIds(IOrganizationService service, IPluginExecutionContext context)
        {
            if (context.InputParameters.Contains("Sheets"))
            {
                if (context.InputParameters["Sheets"] is EntityReferenceCollection refs)
                    return refs.Where(r => string.Equals(r.LogicalName, SheetEntity, StringComparison.OrdinalIgnoreCase))
                        .Select(r => r.Id)
                        .ToList();

                if (context.InputParameters["Sheets"] is string csv)
                {
                    var ids = new List<Guid>();
                    foreach (var token in csv.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries))
                    {
                        if (Guid.TryParse(token.Trim(), out var id))
                            ids.Add(id);
                    }
                    return ids;
                }
            }

            if (!context.InputParameters.Contains("Drawing"))
                return new List<Guid>();

            var drawingRef = context.InputParameters["Drawing"] as EntityReference;
            if (drawingRef == null || !string.Equals(drawingRef.LogicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException("Drawing must be an enmax_autocaddrawing reference.");

            bool allAvailable = context.InputParameters.Contains("AllAvailable")
                && Convert.ToBoolean(context.InputParameters["AllAvailable"], CultureInfo.InvariantCulture);

            var q = new QueryExpression(SheetEntity)
            {
                ColumnSet = new ColumnSet("enmax_autocadsheetid"),
            };
            q.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, drawingRef.Id);
            if (allAvailable)
                q.Criteria.AddCondition(ColSheetState, ConditionOperator.Equal, SheetStateAvailable);
            return service.RetrieveMultiple(q).Entities.Select(e => e.Id).ToList();
        }

        private static void EnsureNoPendingOrActiveCheckout(IOrganizationService service, Guid sheetId)
        {
            var q = new QueryExpression(CheckoutEntity)
            {
                ColumnSet = new ColumnSet(false),
                TopCount = 1,
            };
            q.Criteria.AddCondition(ColCheckoutSheet, ConditionOperator.Equal, sheetId);
            q.Criteria.AddCondition(ColCheckoutStatus, ConditionOperator.In,
                CheckoutStatusRequested, CheckoutStatusOpen, CheckoutStatusAwaitingValidation);
            if (service.RetrieveMultiple(q).Entities.Count > 0)
            {
                throw new InvalidPluginExecutionException(
                    $"Sheet {sheetId} already has a pending or active check-out.");
            }
        }
    }
}
