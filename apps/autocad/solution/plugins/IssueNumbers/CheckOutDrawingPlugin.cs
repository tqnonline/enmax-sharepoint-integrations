using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for checking out a drawing.
    /// Custom API: enmax_acdnCheckOutDrawing (bound to enmax_autocaddrawing)
    ///
    /// AppConfig RequireCheckOutApproval (WS3, defaults TRUE when absent — a governance control
    /// must not silently disable itself):
    ///  - true  (gated): creates a Requested(6) checkout and leaves the drawing Available(1). An
    ///           Approver/Admin must run enmax_acdnApproveCheckout before it becomes CheckedOut and
    ///           the drop-off upload window opens. A second request while one is pending/active is rejected.
    ///  - false (legacy immediate): Available(1) -> CheckedOut(2) with optimistic concurrency, an Open(1)
    ///           checkout, and sheet propagation.
    /// </summary>
    public class CheckOutDrawingPlugin : PluginBase
    {
        // -----------------------------------------------------------------------
        // Constants
        // -----------------------------------------------------------------------

        private const string DrawingEntity       = "enmax_autocaddrawing";
        private const string ColDrawingState     = "enmax_acdnstate";

        private const string CheckoutEntity      = "enmax_autocadcheckout";
        private const string ColCheckoutStatus   = "enmax_acdnstatus";
        private const string ColCheckoutDrawing  = "enmax_acdndrawing";
        private const string ColCheckedOutBy     = "enmax_acdncheckedoutby";
        private const string ColCheckedOutOn     = "enmax_acdncheckedouton";
        private const string ColCheckoutName     = "enmax_acdnname";

        private const string AuditEntity            = "enmax_autocadauditevent";
        private const int    AuditEventStateChanged = 2;
        private const int    AuditSourceAction      = 4;

        private const string SheetEntity          = "enmax_autocadsheet";
        private const string ColSheetDrawing      = "enmax_acdndrawing";
        private const string ColSheetState        = "enmax_acdnstate";
        private const int    SheetStateCheckedOut = 3;

        private const int StateAvailable   = 1;
        private const int StateCheckedOut  = 2;
        private const int StatusOpen       = 1;
        private const int StatusAwaiting   = 2;
        private const int StatusRequested  = 6;

        // Approver/Admin notification when a Check Out is requested.
        private const int    NotifSeverityWarning = 2; // Info=1, Warning=2, Critical=3 (Code App severity map)
        private const int    NotifSourceSystem    = 8; // "System Message" (no dedicated Check Out source event)
        private const string CheckoutQueueDeepLink = "/approvals?tab=checkouts";

        // -----------------------------------------------------------------------
        // Constructors
        // -----------------------------------------------------------------------

        public CheckOutDrawingPlugin() : base(typeof(CheckOutDrawingPlugin)) { }

        public CheckOutDrawingPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(CheckOutDrawingPlugin)) { }

        // -----------------------------------------------------------------------
        // Core logic
        // -----------------------------------------------------------------------

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;

            if (!context.InputParameters.Contains("Target"))
                throw new InvalidPluginExecutionException("Missing required input: Target");

            var target = context.InputParameters["Target"] as EntityReference;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");

            if (!string.Equals(target.LogicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException(
                    $"Target must be {DrawingEntity}, got {target.LogicalName}");

            localPluginContext.Trace($"CheckOut drawing {target.Id} by user {context.InitiatingUserId}");

            // Retrieve drawing with RowVersion for optimistic concurrency
            Entity drawing;
            try
            {
                drawing = service.Retrieve(DrawingEntity, target.Id,
                    new ColumnSet(ColDrawingState, "ownerid"));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException(
                    $"Could not retrieve drawing {target.Id}: {ex.Message}", ex);
            }

            Authorization.RequireOwnerOrAdmin(service,
                drawing.GetAttributeValue<EntityReference>("ownerid")?.Id ?? Guid.Empty,
                context.InitiatingUserId,
                "check out this drawing");

            int currentState = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;

            if (currentState != StateAvailable)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} cannot be checked out from state {currentState}. " +
                    $"Expected {StateAvailable} (Available).");

            if (GetRequireCheckOutApproval(service))
                RequestCheckout(localPluginContext, service, context, target);
            else
                ImmediateCheckout(localPluginContext, service, context, target, drawing);
        }

        // -----------------------------------------------------------------------
        // Gated path — create a Requested checkout; the drawing is NOT moved yet.
        // -----------------------------------------------------------------------

        private static void RequestCheckout(
            ILocalPluginContext localPluginContext, IOrganizationService service,
            IPluginExecutionContext context, EntityReference target)
        {
            // Advisory lock: reject a second request while one is already pending/active for this drawing.
            var existing = new QueryExpression(CheckoutEntity) { ColumnSet = new ColumnSet(false), TopCount = 1 };
            existing.Criteria.AddCondition(ColCheckoutDrawing, ConditionOperator.Equal, target.Id);
            existing.Criteria.AddCondition(ColCheckoutStatus, ConditionOperator.In,
                StatusRequested, StatusOpen, StatusAwaiting);
            if (service.RetrieveMultiple(existing).Entities.Count > 0)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} already has a pending or active check-out. Wait for it to be resolved.");

            Guid checkoutId;
            try
            {
                checkoutId = service.Create(new Entity(CheckoutEntity)
                {
                    [ColCheckoutStatus]       = new OptionSetValue(StatusRequested),
                    [ColCheckoutDrawing]      = new EntityReference(DrawingEntity, target.Id),
                    [ColCheckedOutBy]         = new EntityReference("systemuser", context.InitiatingUserId),
                    [ColCheckedOutOn]         = DateTime.UtcNow,
                    [ColCheckoutName]         = $"CHK-{target.Id}",
                    // Empty placeholder satisfies the (Drawing + NewRevision + Status) alt key at create.
                    ["enmax_acdnnewrevision"] = string.Empty,
                    ["ownerid"]               = new EntityReference("systemuser", context.InitiatingUserId),
                });
            }
            catch (FaultException<OrganizationServiceFault> ex)
                when (ex.Detail?.ErrorCode == -2147220937 ||
                      (ex.Message != null && ex.Message.Contains("Duplicate")))
            {
                // Alt-key collision = a concurrent request beat us to it.
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} already has a pending check-out request. Wait for it to be resolved.", ex);
            }

            localPluginContext.Trace($"Checkout {checkoutId} requested (pending approval).");
            context.OutputParameters["CheckoutId"] = checkoutId.ToString();

            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventStateChanged),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdnfromstate"]    = "Available",
                ["enmax_acdntostate"]      = "CheckoutRequested",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Drawing {target.Id} check out requested",
            });

            NotifyApprovers(service, context, target.Id, checkoutId);
        }

        private static void NotifyApprovers(
            IOrganizationService service, IPluginExecutionContext context, Guid drawingId, Guid checkoutId)
        {
            var recipients = NotificationWriter.GetApproverAndAdminUserIds(service, context.InitiatingUserId);
            if (recipients.Count == 0) return;

            string number = NotificationWriter.ResolveDrawingNumber(service, drawingId);
            string actor  = NotificationWriter.ResolveActorName(service, context.InitiatingUserId);

            foreach (var recipientId in recipients)
                NotificationWriter.Create(service, recipientId,
                    title:        $"Check Out requested: {number}",
                    body:         $"{actor} requested to check out {number}. Approve or decline it on the Approvals page.",
                    severity:     NotifSeverityWarning,
                    sourceEvent:  NotifSourceSystem,
                    subjectTable: CheckoutEntity,
                    subjectId:    checkoutId.ToString(),
                    deepLinkPath: CheckoutQueueDeepLink);
        }

        // -----------------------------------------------------------------------
        // Legacy immediate path (RequireCheckOutApproval off).
        // -----------------------------------------------------------------------

        private static void ImmediateCheckout(
            ILocalPluginContext localPluginContext, IOrganizationService service,
            IPluginExecutionContext context, EntityReference target, Entity drawing)
        {
            // Update drawing to CheckedOut using RowVersion to prevent double checkout
            var drawingUpdate = new Entity(DrawingEntity, target.Id)
            {
                RowVersion        = drawing.RowVersion,
                [ColDrawingState] = new OptionSetValue(StateCheckedOut),
            };

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
                    $"Drawing {target.Id} was concurrently modified (ConcurrencyVersionMismatch). " +
                    "Retry the checkout.", ex);
            }

            localPluginContext.Trace($"Drawing {target.Id} transitioned to CheckedOut.");

            // Propagate state to sheets (drawing update above serialized concurrent access — no RowVersion needed)
            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, target.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(SheetStateCheckedOut) });

            // Create the checkout row.
            // enmax_acdnnewrevision is set to an empty placeholder (not null) so the
            // alternate key (Drawing + NewRevision + Status) is satisfied at create
            // time — Dataverse alt keys reject null columns. SubmitRevisionPlugin /
            // ForceCheckinPlugin overwrite it with the actual cycle token on submit.
            var checkout = new Entity(CheckoutEntity)
            {
                [ColCheckoutStatus]   = new OptionSetValue(StatusOpen),
                [ColCheckoutDrawing]  = new EntityReference(DrawingEntity, target.Id),
                [ColCheckedOutBy]     = new EntityReference("systemuser", context.InitiatingUserId),
                [ColCheckedOutOn]     = DateTime.UtcNow,
                [ColCheckoutName]     = $"CHK-{target.Id}",
                ["enmax_acdnnewrevision"] = string.Empty,
                ["ownerid"]           = new EntityReference("systemuser", context.InitiatingUserId),
            };

            Guid checkoutId = service.Create(checkout);

            localPluginContext.Trace($"Checkout {checkoutId} created.");

            context.OutputParameters["CheckoutId"] = checkoutId.ToString();

            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventStateChanged),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdnfromstate"]    = "Available",
                ["enmax_acdntostate"]      = "CheckedOut",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Drawing {target.Id} checked out",
            });
        }

        // Defaults to TRUE when the key is absent: a governance control must not silently disable itself.
        private static bool GetRequireCheckOutApproval(IOrganizationService service)
        {
            string raw = AppConfigReader.GetValue(service, "RequireCheckOutApproval");
            if (string.IsNullOrWhiteSpace(raw)) return true;
            bool v;
            return !bool.TryParse(raw, out v) || v;
        }
    }
}
