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
    /// Reads AppConfig RequireCheckInApproval:
    ///  - false: closes checkout (ClosedApproved), drawing -> Available + bumped revision, sheets -> Available.
    ///  - true : checkout -> AwaitingValidation, drawing -> AwaitingValidation, sheets -> AwaitingValidation.
    /// Drawing update uses RowVersion concurrency; sheets/audit follow the serialized drawing update.
    /// </summary>
    public class SubmitRevisionPlugin : PluginBase
    {
        private const string CheckoutEntity      = "enmax_autocadcheckout";
        private const string ColCheckoutStatus   = "enmax_acdnstatus";
        private const string ColCheckoutDrawing  = "enmax_acdndrawing";
        private const string ColNewRevision      = "enmax_acdnnewrevision";

        private const string DrawingEntity       = "enmax_autocaddrawing";
        private const string ColDrawingState     = "enmax_acdnstate";
        private const string ColCurrentRevision  = "enmax_acdncurrentrevision";

        private const string SheetEntity         = "enmax_autocadsheet";
        private const string ColSheetDrawing     = "enmax_acdndrawing";
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

        private const int StateAvailable          = 1;
        private const int StateCheckedOut         = 2;
        private const int StateAwaitingValidation = 3;

        private const int SheetStateAvailable          = 2;
        private const int SheetStateAwaitingValidation = 4;

        public SubmitRevisionPlugin() : base(typeof(SubmitRevisionPlugin)) { }
        public SubmitRevisionPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(SubmitRevisionPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.InitiatingUserService;

            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as EntityReference : null;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");
            if (!string.Equals(target.LogicalName, CheckoutEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"Target must be {CheckoutEntity}, got {target.LogicalName}");

            string newRevision = context.InputParameters.Contains("NewRevision")
                ? context.InputParameters["NewRevision"] as string : null;
            if (string.IsNullOrWhiteSpace(newRevision))
                throw new InvalidPluginExecutionException("Missing required input: NewRevision");
            newRevision = newRevision.Trim();

            Entity checkout;
            try
            {
                checkout = service.Retrieve(CheckoutEntity, target.Id,
                    new ColumnSet(ColCheckoutStatus, ColCheckoutDrawing));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException($"Could not retrieve checkout {target.Id}: {ex.Message}", ex);
            }

            int currentStatus = checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus)?.Value ?? 0;
            if (currentStatus != StatusOpen)
                throw new InvalidPluginExecutionException(
                    $"Checkout {target.Id} cannot accept a revision from status {currentStatus}. Expected {StatusOpen} (Open).");

            var drawingRef = checkout.GetAttributeValue<EntityReference>(ColCheckoutDrawing);
            if (drawingRef == null)
                throw new InvalidPluginExecutionException($"Checkout {target.Id} has no associated drawing.");

            Entity drawing = service.Retrieve(DrawingEntity, drawingRef.Id, new ColumnSet(ColDrawingState));
            int drawingStateNow = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
            if (drawingStateNow != StateCheckedOut)
                throw new InvalidPluginExecutionException(
                    $"Drawing {drawingRef.Id} must be CheckedOut ({StateCheckedOut}) to submit a revision; was {drawingStateNow}.");

            bool requireApproval = GetRequireCheckInApproval(service);

            int targetDrawingState = requireApproval ? StateAwaitingValidation : StateAvailable;
            int targetSheetState   = requireApproval ? SheetStateAwaitingValidation : SheetStateAvailable;
            int targetStatus       = requireApproval ? StatusAwaitingValidation : StatusClosedApproved;

            var drawingUpdate = new Entity(DrawingEntity, drawingRef.Id)
            {
                RowVersion        = drawing.RowVersion,
                [ColDrawingState] = new OptionSetValue(targetDrawingState),
            };
            if (!requireApproval) drawingUpdate[ColCurrentRevision] = newRevision;

            try
            {
                service.Execute(new UpdateRequest
                {
                    Target              = drawingUpdate,
                    ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
                });
            }
            catch (FaultException<OrganizationServiceFault> ex)
                when (ex.Detail?.ErrorCode == -2147088254 ||
                      (ex.Message != null && ex.Message.Contains("ConcurrencyVersionMismatch")))
            {
                throw new InvalidPluginExecutionException(
                    $"Drawing {drawingRef.Id} was concurrently modified (ConcurrencyVersionMismatch). Retry.", ex);
            }

            var checkoutUpdate = new Entity(CheckoutEntity, target.Id)
            {
                [ColCheckoutStatus] = new OptionSetValue(targetStatus),
                [ColNewRevision]    = newRevision,
            };
            if (!requireApproval)
            {
                checkoutUpdate["enmax_acdnclosedon"] = DateTime.UtcNow;
                checkoutUpdate["enmax_acdnclosedby"] = new EntityReference("systemuser", context.InitiatingUserId);
            }
            service.Update(checkoutUpdate);

            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, drawingRef.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(targetSheetState) });

            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventStateChanged),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = drawingRef.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdnfromstate"]    = "CheckedOut",
                ["enmax_acdntostate"]      = requireApproval ? "AwaitingValidation" : "Available",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Drawing {drawingRef.Id} revision {newRevision} submitted",
            });

            context.OutputParameters["NewStatus"]    = targetStatus;
            context.OutputParameters["DrawingState"] = targetDrawingState;
        }

        private static bool GetRequireCheckInApproval(IOrganizationService service)
        {
            var q = new QueryExpression(AppConfigEntity) { ColumnSet = new ColumnSet(ColAppConfigValue), TopCount = 1 };
            q.Criteria.AddCondition(ColAppConfigKey, ConditionOperator.Equal, "RequireCheckInApproval");
            var results = service.RetrieveMultiple(q);
            if (results.Entities.Count == 0) return false;
            bool v;
            return bool.TryParse(results.Entities[0].GetAttributeValue<string>(ColAppConfigValue), out v) && v;
        }
    }
}
