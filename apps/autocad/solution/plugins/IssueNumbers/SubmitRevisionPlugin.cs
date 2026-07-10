using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for submitting a revision against an open checkout.
    /// Custom API: enmax_acdnSubmitRevision (bound to enmax_autocadcheckout)
    ///
    /// Reads AppConfig RequireCheckInApproval (defaults to true when the row is absent):
    ///  - false: closes checkout (ClosedApproved), drawing -> Available + bumped revision, sheets -> Available.
    ///  - true : checkout -> AwaitingValidation, drawing -> AwaitingValidation, sheets -> AwaitingValidation.
    /// Drawing update uses RowVersion concurrency; sheets/audit follow the serialized drawing update.
    /// </summary>
    public class SubmitRevisionPlugin : PluginBase
    {
        private const string CheckoutEntity      = "enmax_autocadcheckout";
        private const string ColCheckoutStatus   = "enmax_acdnstatus";
        private const string ColCheckoutDrawing  = "enmax_acdndrawing";
        private const string ColCheckoutSheet    = "enmax_acdnsheet";
        private const string ColNewRevision      = "enmax_acdnnewrevision";
        private const string ColSubmissionInfo   = "enmax_acdnsubmissioninfo";

        private const string DrawingEntity       = "enmax_autocaddrawing";
        private const string ColCurrentRevision  = "enmax_acdncurrentrevision";
        private const string ColDrawingNumber    = "enmax_acdnnumber";

        private const string SheetEntity         = CheckOutSheetsPlugin.SheetEntity;
        private const string ColSheetState       = "enmax_acdnstate";

        private const string AppConfigEntity     = "enmax_autocadappconfig";
        private const string ColAppConfigKey     = "enmax_acdnkey";
        private const string ColAppConfigValue   = "enmax_acdnvalue";

        private const string AuditEntity            = "enmax_autocadauditevent";
        private const int    AuditEventStateChanged = 2;
        private const int    AuditSourceAction      = 4;

        private const int StatusOpen               = 1;
        private const int StatusAwaitingValidation = 2;
        private const int StatusClosedApproved     = 3;

        private const int SheetStateAvailable          = 2;
        private const int SheetStateCheckedOut         = 3;
        private const int SheetStateAwaitingValidation = 4;

        // In-app notification to approvers/admins when a check-in needs validation.
        private const int NotifSeverityWarning   = 2; // Info=1, Warning=2, Critical=3 (Code App severity map)
        private const int NotifSourceSystem      = 8; // "System Message" (no dedicated Check-In-Submitted source event)
        private const string CheckinDeepLink     = "/approvals?tab=checkins";

        public SubmitRevisionPlugin() : base(typeof(SubmitRevisionPlugin)) { }
        public SubmitRevisionPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(SubmitRevisionPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;
            var actorId = PluginActor.ResolveForCustomApi(context, service);

            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as EntityReference : null;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");
            if (!string.Equals(target.LogicalName, CheckoutEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"Target must be {CheckoutEntity}, got {target.LogicalName}");

            // WS3: the revision number is gone — SharePoint version history is the revision trail.
            // Check In now captures mandatory Submission Information (Project, WO#, ...) instead.
            string submissionInfo = context.InputParameters.Contains("SubmissionInfo")
                ? context.InputParameters["SubmissionInfo"] as string : null;
            if (string.IsNullOrWhiteSpace(submissionInfo))
                throw new InvalidPluginExecutionException("Missing required input: SubmissionInfo");
            submissionInfo = submissionInfo.Trim();

            // Internal, non-user cycle token. Kept on enmax_acdnnewrevision so the checkout alt key
            // (Drawing + NewRevision + Status) stays unique across cycles, and mirrored onto the
            // drawing's current-revision marker so "has been checked in" gating keeps working.
            string cycleToken = DateTime.UtcNow.Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture);

            Entity checkout;
            try
            {
                checkout = service.Retrieve(CheckoutEntity, target.Id,
                    new ColumnSet(ColCheckoutStatus, ColCheckoutDrawing, ColCheckoutSheet, "ownerid"));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException($"Could not retrieve checkout {target.Id}: {ex.Message}", ex);
            }

            Authorization.RequireSelf(
                checkout.GetAttributeValue<EntityReference>("ownerid")?.Id ?? Guid.Empty,
                actorId,
                "submit a revision on this check-out");

            int currentStatus = checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus)?.Value ?? 0;
            if (currentStatus != StatusOpen)
                throw new InvalidPluginExecutionException(
                    $"Checkout {target.Id} cannot accept a revision from status {currentStatus}. Expected {StatusOpen} (Open).");

            var sheetRef = checkout.GetAttributeValue<EntityReference>(ColCheckoutSheet);
            if (sheetRef == null)
                throw new InvalidPluginExecutionException($"Checkout {target.Id} has no associated sheet.");
            var sheet = service.Retrieve(SheetEntity, sheetRef.Id, new ColumnSet(ColSheetState, "enmax_acdndrawing"));
            var drawingRef = sheet.GetAttributeValue<EntityReference>("enmax_acdndrawing");
            if (drawingRef == null)
                throw new InvalidPluginExecutionException($"Sheet {sheetRef.Id} has no associated drawing.");

            int sheetStateNow = sheet.GetAttributeValue<OptionSetValue>(ColSheetState)?.Value ?? 0;
            if (sheetStateNow != SheetStateCheckedOut)
                throw new InvalidPluginExecutionException(
                    $"Sheet {sheetRef.Id} must be CheckedOut ({SheetStateCheckedOut}) to submit a revision; was {sheetStateNow}.");

            bool requireApproval = GetRequireCheckInApproval(service);

            int targetSheetState   = requireApproval ? SheetStateAwaitingValidation : SheetStateAvailable;
            int targetStatus       = requireApproval ? StatusAwaitingValidation : StatusClosedApproved;

            // Guard the shared drawing marker before any state mutation. Dataverse rolls the
            // whole synchronous transaction back if a later write fails.
            if (!requireApproval)
            {
                var currentDrawing = service.Retrieve(
                    DrawingEntity,
                    drawingRef.Id,
                    new ColumnSet(ColCurrentRevision));
                var drawingUpdate = new Entity(DrawingEntity, drawingRef.Id)
                {
                    RowVersion = currentDrawing.RowVersion,
                    [ColCurrentRevision] = cycleToken,
                };

                try
                {
                    if (string.IsNullOrWhiteSpace(drawingUpdate.RowVersion))
                    {
                        service.Update(drawingUpdate);
                    }
                    else
                    {
                        service.Execute(new UpdateRequest
                        {
                            Target = drawingUpdate,
                            ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
                        });
                    }
                }
                catch (FaultException<OrganizationServiceFault> ex)
                    when (ex.Detail?.ErrorCode == -2147088254 ||
                          (ex.Message != null && ex.Message.Contains("ConcurrencyVersionMismatch")))
                {
                    throw new InvalidPluginExecutionException(
                        $"Drawing {drawingRef.Id} was concurrently modified (ConcurrencyVersionMismatch). Retry.", ex);
                }
            }

            var checkoutUpdate = new Entity(CheckoutEntity, target.Id)
            {
                [ColCheckoutStatus] = new OptionSetValue(targetStatus),
                [ColNewRevision]    = cycleToken,
                [ColSubmissionInfo] = submissionInfo,
            };
            if (!requireApproval)
            {
                checkoutUpdate["enmax_acdnclosedon"] = DateTime.UtcNow;
                checkoutUpdate["enmax_acdnclosedby"] = new EntityReference("systemuser", actorId);
            }
            service.Update(checkoutUpdate);

            service.Update(new Entity(SheetEntity, sheetRef.Id) { [ColSheetState] = new OptionSetValue(targetSheetState) });

            int drawingState = DrawingRollupHelper.RecomputeDrawingRollup(service, drawingRef.Id);

            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventStateChanged),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = sheetRef.Id.ToString(),
                ["enmax_acdnsubjecttable"] = SheetEntity,
                ["enmax_acdnfromstate"]    = "CheckedOut",
                ["enmax_acdntostate"]      = requireApproval ? "AwaitingValidation" : "Available",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", actorId),
                ["enmax_acdnname"]         = $"Sheet {sheetRef.Id} checked in",
            });

            // A check-in always notifies approvers/admins — to validate it (approval on) or to move the
            // files to SharePoint (approval off). Admins must hear about every check-in either way.
            var drawing = service.Retrieve(DrawingEntity, drawingRef.Id, new ColumnSet(ColDrawingNumber));
            NotifyApprovers(service, context, drawing, target.Id, requireApproval, actorId);

            context.OutputParameters["NewStatus"]    = targetStatus;
            context.OutputParameters["DrawingState"] = drawingState;
        }

        // Notify every Approver/Admin (minus the submitter) about a check-in. When approval is required the
        // ask is "validate it"; when not, the ask is "move the files" — but admins are told either way.
        private static void NotifyApprovers(
            IOrganizationService service, IPluginExecutionContext context,
            Entity drawing, Guid checkoutId, bool requireApproval, Guid actorId)
        {
            var recipients = NotificationWriter.GetApproverAndAdminUserIds(service, actorId);
            if (recipients.Count == 0) return;

            string number = drawing.GetAttributeValue<string>(ColDrawingNumber);
            if (string.IsNullOrWhiteSpace(number)) number = drawing.Id.ToString();
            string actor = NotificationWriter.ResolveActorName(service, actorId);

            string title = requireApproval
                ? $"Check In pending validation: {number}"
                : $"Drawing checked in: {number}";
            string body = requireApproval
                ? $"{actor} checked in {number}. Review and validate it on the Approvals page."
                : $"{actor} checked in {number}. Please move the files to the SharePoint library.";

            foreach (var recipientId in recipients)
                NotificationWriter.Create(service, recipientId,
                    title:        title,
                    body:         body,
                    severity:     NotifSeverityWarning,
                    sourceEvent:  NotifSourceSystem,
                    subjectTable: CheckoutEntity,
                    subjectId:    checkoutId.ToString(),
                    deepLinkPath: CheckinDeepLink);
        }

        private static bool GetRequireCheckInApproval(IOrganizationService service)
        {
            var q = new QueryExpression(AppConfigEntity) { ColumnSet = new ColumnSet(ColAppConfigValue), TopCount = 1 };
            q.Criteria.AddCondition(ColAppConfigKey, ConditionOperator.Equal, "RequireCheckInApproval");
            var results = service.RetrieveMultiple(q);
            // Default ON when the row is absent: check-ins are a gated approval step (mirrors
            // RequireCheckOutApproval). An explicit "false" row is required to auto-close check-ins.
            if (results.Entities.Count == 0) return true;
            bool v;
            return bool.TryParse(results.Entities[0].GetAttributeValue<string>(ColAppConfigValue), out v) ? v : true;
        }
    }
}
