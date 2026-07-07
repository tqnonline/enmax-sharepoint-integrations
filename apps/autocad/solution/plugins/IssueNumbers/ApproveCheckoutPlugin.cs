using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for approving or declining a Check Out request (WS3).
    /// Custom API: enmax_acdnApproveCheckout (bound to enmax_autocadcheckout)
    ///
    /// A gated Check Out lands the checkout in Requested(6) with the drawing left Available(1).
    /// This plug-in resolves that request (Approver/Admin only):
    ///  - Approve : checkout Requested(6) -> Open(1); drawing Available(1) -> CheckedOut(2); sheets -> CheckedOut(3).
    ///              Only now is the drop-off working window (upload) enabled for the requester.
    ///  - Decline : checkout Requested(6) -> ClosedDeclined(4) + validation reason; drawing stays Available(1).
    /// The requester is notified either way; every state change is audited against the drawing.
    /// </summary>
    public class ApproveCheckoutPlugin : PluginBase
    {
        private const string CheckoutEntity      = "enmax_autocadcheckout";
        private const string ColCheckoutStatus   = "enmax_acdnstatus";
        private const string ColCheckoutDrawing  = "enmax_acdndrawing";
        private const string ColValidationReason = "enmax_acdnvalidationreason";
        private const string ColCheckoutOwner    = "ownerid";

        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string ColDrawingState = "enmax_acdnstate";

        private const string SheetEntity          = "enmax_autocadsheet";
        private const string ColSheetDrawing      = "enmax_acdndrawing";
        private const string ColSheetState        = "enmax_acdnstate";
        private const int    SheetStateCheckedOut = 3;

        private const string AuditEntity         = "enmax_autocadauditevent";
        private const int    AuditEventApproved  = 3; // Approval Granted
        private const int    AuditEventDeclined  = 4; // Approval Denied
        private const int    AuditSourceAction   = 4;

        private const int StatusOpen           = 1;
        private const int StatusClosedDeclined = 4;
        private const int StatusRequested      = 6;

        private const int StateAvailable  = 1;
        private const int StateCheckedOut = 2;

        private const int DecisionApproved = 1;
        private const int DecisionDeclined = 2;

        // Requester notifications reuse existing source events / severity map (Info=1, Warning=2).
        private const int    NotifSeverityInfo    = 1;
        private const int    NotifSeverityWarning = 2;
        private const int    NotifSourceSystem    = 8; // "System Message" (no dedicated Check Out source event)
        private const string CheckoutDeepLink     = "/my-items?tab=checkouts";

        public ApproveCheckoutPlugin() : base(typeof(ApproveCheckoutPlugin)) { }
        public ApproveCheckoutPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ApproveCheckoutPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;

            if (!context.InputParameters.Contains("Target"))
                throw new InvalidPluginExecutionException("Missing required input: Target");

            var target = context.InputParameters["Target"] as EntityReference;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");

            if (!string.Equals(target.LogicalName, CheckoutEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException(
                    $"Target must be {CheckoutEntity}, got {target.LogicalName}");

            Authorization.RequireApproverOrAdmin(service, context.InitiatingUserId, "approve a check-out");

            if (!context.InputParameters.Contains("Decision"))
                throw new InvalidPluginExecutionException("Missing required input: Decision");

            int decision = Convert.ToInt32(context.InputParameters["Decision"]);
            if (decision != DecisionApproved && decision != DecisionDeclined)
                throw new InvalidPluginExecutionException(
                    $"Decision must be {DecisionApproved} (Approved) or {DecisionDeclined} (Declined), got {decision}.");

            string reason = context.InputParameters.Contains("Reason")
                ? context.InputParameters["Reason"] as string ?? string.Empty
                : string.Empty;

            if (decision == DecisionDeclined && reason.Length < 10)
                throw new InvalidPluginExecutionException(
                    "Reason must be at least 10 characters when declining a check-out.");

            localPluginContext.Trace(
                $"ApproveCheckout: checkout={target.Id}, decision={decision}, user={context.InitiatingUserId}");

            Entity checkout;
            try
            {
                checkout = service.Retrieve(CheckoutEntity, target.Id,
                    new ColumnSet(ColCheckoutStatus, ColCheckoutDrawing, ColCheckoutOwner));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException(
                    $"Could not retrieve checkout {target.Id}: {ex.Message}", ex);
            }

            int currentStatus = checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus)?.Value ?? 0;

            // Idempotent: an already-approved (Open) request is a no-op.
            if (currentStatus == StatusOpen)
            {
                localPluginContext.Trace($"Checkout {target.Id} already Open — idempotent no-op.");
                context.OutputParameters["CheckoutId"]   = target.Id.ToString();
                context.OutputParameters["NewStatus"]    = StatusOpen;
                context.OutputParameters["DrawingState"] = StateCheckedOut;
                return;
            }

            if (currentStatus != StatusRequested)
                throw new InvalidPluginExecutionException(
                    $"Checkout {target.Id} cannot be reviewed from status {currentStatus}. " +
                    $"Expected {StatusRequested} (Requested).");

            var drawingRef = checkout.GetAttributeValue<EntityReference>(ColCheckoutDrawing);
            if (drawingRef == null)
                throw new InvalidPluginExecutionException($"Checkout {target.Id} has no associated drawing.");

            int newStatus;
            int drawingState;
            int auditEvent;

            if (decision == DecisionApproved)
            {
                // Only now does the drawing actually become CheckedOut — guarded by RowVersion so a
                // concurrent state change (e.g. someone released/finalized it) forces a retry.
                Entity drawing = service.Retrieve(DrawingEntity, drawingRef.Id, new ColumnSet(ColDrawingState));
                int drawingStateNow = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
                if (drawingStateNow != StateAvailable)
                    throw new InvalidPluginExecutionException(
                        $"Drawing {drawingRef.Id} must be Available ({StateAvailable}) to approve a check-out; was {drawingStateNow}.");

                try
                {
                    service.Execute(new UpdateRequest
                    {
                        Target = new Entity(DrawingEntity, drawingRef.Id)
                        {
                            RowVersion        = drawing.RowVersion,
                            [ColDrawingState] = new OptionSetValue(StateCheckedOut),
                        },
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

                service.Update(new Entity(CheckoutEntity, target.Id)
                {
                    [ColCheckoutStatus] = new OptionSetValue(StatusOpen),
                });

                PropagateSheetState(service, drawingRef.Id, SheetStateCheckedOut);

                newStatus    = StatusOpen;
                drawingState = StateCheckedOut;
                auditEvent   = AuditEventApproved;

                localPluginContext.Trace($"Checkout {target.Id} approved; drawing {drawingRef.Id} CheckedOut.");
            }
            else
            {
                // Decline — close the request; the drawing was never moved, so it stays Available.
                service.Update(new Entity(CheckoutEntity, target.Id)
                {
                    [ColCheckoutStatus]   = new OptionSetValue(StatusClosedDeclined),
                    [ColValidationReason] = reason,
                });

                newStatus    = StatusClosedDeclined;
                drawingState = StateAvailable;
                auditEvent   = AuditEventDeclined;

                localPluginContext.Trace($"Checkout {target.Id} declined; drawing {drawingRef.Id} stays Available.");
            }

            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(auditEvent),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = drawingRef.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdnfromstate"]    = "CheckoutRequested",
                ["enmax_acdntostate"]      = decision == DecisionApproved ? "CheckedOut" : "Available",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Check out {(decision == DecisionApproved ? "approved" : "declined")} for {drawingRef.Id}",
            });

            // Notify the requester of the outcome.
            var requester = checkout.GetAttributeValue<EntityReference>(ColCheckoutOwner);
            if (requester != null && requester.Id != context.InitiatingUserId)
            {
                string number = NotificationWriter.ResolveDrawingNumber(service, drawingRef.Id);
                if (decision == DecisionApproved)
                    NotificationWriter.Create(service, requester.Id,
                        title:        $"Check Out approved: {number}",
                        body:         $"Your Check Out of {number} was approved. It is now checked out to you — upload your revised PDF to the drop-off library, then Check In.",
                        severity:     NotifSeverityInfo,
                        sourceEvent:  NotifSourceSystem,
                        subjectTable: CheckoutEntity,
                        subjectId:    target.Id.ToString(),
                        deepLinkPath: CheckoutDeepLink);
                else
                    NotificationWriter.Create(service, requester.Id,
                        title:        $"Check Out declined: {number}",
                        body:         $"Your Check Out of {number} was declined: {reason}",
                        severity:     NotifSeverityWarning,
                        sourceEvent:  NotifSourceSystem,
                        subjectTable: CheckoutEntity,
                        subjectId:    target.Id.ToString(),
                        deepLinkPath: CheckoutDeepLink);
            }

            context.OutputParameters["CheckoutId"]   = target.Id.ToString();
            context.OutputParameters["NewStatus"]    = newStatus;
            context.OutputParameters["DrawingState"] = drawingState;
        }

        private static void PropagateSheetState(IOrganizationService service, Guid drawingId, int sheetState)
        {
            var q = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            q.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, drawingId);
            foreach (var sheet in service.RetrieveMultiple(q).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(sheetState) });
        }
    }
}
