using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for approving or declining a submitted revision.
    /// Custom API: enmax_acdnApproveCheckin (bound to enmax_autocadcheckout)
    ///
    /// Approved path: Checkout → ClosedApproved(3), Drawing → Available(1) + bumped revision.
    /// Declined path: Checkout → Open(1) + validationReason, Drawing stays CheckedOut(2).
    /// </summary>
    public class ApproveCheckinPlugin : PluginBase
    {
        // -----------------------------------------------------------------------
        // Constants
        // -----------------------------------------------------------------------

        private const string CheckoutEntity          = "enmax_autocadcheckout";
        private const string ColCheckoutStatus       = "enmax_acdnstatus";
        private const string ColCheckoutDrawing      = "enmax_acdndrawing";
        private const string ColClosedBy             = "enmax_acdnclosedby";
        private const string ColClosedOn             = "enmax_acdnclosedon";
        private const string ColNewRevision          = "enmax_acdnnewrevision";
        private const string ColValidationReason     = "enmax_acdnvalidationreason";

        private const string DrawingEntity           = "enmax_autocaddrawing";
        private const string ColDrawingState         = "enmax_acdnstate";
        private const string ColCurrentRevision      = "enmax_acdncurrentrevision";

        private const string AuditEntity             = "enmax_autocadauditevent";
        private const int    AuditEventApproved      = 3;
        private const int    AuditEventDeclined      = 4;
        private const int    AuditSourceAction       = 4;

        private const int StatusOpen               = 1;
        private const int StatusAwaitingValidation = 2;
        private const int StatusClosedApproved     = 3;

        private const int StateCheckedOut          = 2;
        private const int StateAvailable           = 1;

        private const int DecisionApproved         = 1;
        private const int DecisionDeclined         = 2;

        // -----------------------------------------------------------------------
        // Constructors
        // -----------------------------------------------------------------------

        public ApproveCheckinPlugin() : base(typeof(ApproveCheckinPlugin)) { }

        public ApproveCheckinPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ApproveCheckinPlugin)) { }

        // -----------------------------------------------------------------------
        // Core logic
        // -----------------------------------------------------------------------

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.InitiatingUserService;

            if (!context.InputParameters.Contains("Target"))
                throw new InvalidPluginExecutionException("Missing required input: Target");

            var target = context.InputParameters["Target"] as EntityReference;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");

            if (!string.Equals(target.LogicalName, CheckoutEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException(
                    $"Target must be {CheckoutEntity}, got {target.LogicalName}");

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
                    "Reason must be at least 10 characters when declining a revision.");

            localPluginContext.Trace(
                $"ApproveCheckin: checkout={target.Id}, decision={decision}, user={context.InitiatingUserId}");

            // Retrieve checkout + drawing FK
            Entity checkout;
            try
            {
                checkout = service.Retrieve(CheckoutEntity, target.Id,
                    new ColumnSet(ColCheckoutStatus, ColCheckoutDrawing, ColNewRevision));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException(
                    $"Could not retrieve checkout {target.Id}: {ex.Message}", ex);
            }

            int currentStatus = checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus)?.Value ?? 0;

            if (currentStatus != StatusAwaitingValidation)
                throw new InvalidPluginExecutionException(
                    $"Checkout {target.Id} cannot be reviewed from status {currentStatus}. " +
                    $"Expected {StatusAwaitingValidation} (AwaitingValidation).");

            var drawingRef = checkout.GetAttributeValue<EntityReference>(ColCheckoutDrawing);
            if (drawingRef == null)
                throw new InvalidPluginExecutionException(
                    $"Checkout {target.Id} has no associated drawing.");

            string newRevision = checkout.GetAttributeValue<string>(ColNewRevision);
            int    newStatus;
            int    drawingState;
            int    auditEvent;

            if (decision == DecisionApproved)
            {
                // Close the checkout
                service.Update(new Entity(CheckoutEntity, target.Id)
                {
                    [ColCheckoutStatus] = new OptionSetValue(StatusClosedApproved),
                    [ColClosedOn]       = DateTime.UtcNow,
                    [ColClosedBy]       = new EntityReference("systemuser", context.InitiatingUserId),
                });

                // Transition drawing back to Available and bump revision
                var drawingUpdate = new Entity(DrawingEntity, drawingRef.Id)
                {
                    [ColDrawingState]    = new OptionSetValue(StateAvailable),
                    [ColCurrentRevision] = newRevision,
                };
                service.Update(drawingUpdate);

                newStatus   = StatusClosedApproved;
                drawingState = StateAvailable;
                auditEvent  = AuditEventApproved;

                localPluginContext.Trace($"Checkout {target.Id} approved; drawing {drawingRef.Id} Available, revision={newRevision}.");
            }
            else
            {
                // Decline — revert checkout to Open so the user can revise and resubmit
                service.Update(new Entity(CheckoutEntity, target.Id)
                {
                    [ColCheckoutStatus]   = new OptionSetValue(StatusOpen),
                    [ColValidationReason] = reason,
                });

                // Revert drawing from AwaitingValidation back to CheckedOut
                service.Update(new Entity(DrawingEntity, drawingRef.Id)
                {
                    [ColDrawingState] = new OptionSetValue(StateCheckedOut),
                });

                newStatus    = StatusOpen;
                drawingState = StateCheckedOut;
                auditEvent   = AuditEventDeclined;

                localPluginContext.Trace($"Checkout {target.Id} declined; drawing {drawingRef.Id} reverted to CheckedOut.");
            }

            // Audit
            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(auditEvent),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = CheckoutEntity,
                ["enmax_acdnfromstate"]    = "AwaitingValidation",
                ["enmax_acdntostate"]      = decision == DecisionApproved ? "ClosedApproved" : "Open",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Checkout {target.Id} {(decision == DecisionApproved ? "approved" : "declined")}",
            });

            context.OutputParameters["CheckoutId"]  = target.Id.ToString();
            context.OutputParameters["NewStatus"]   = newStatus;
            context.OutputParameters["DrawingState"] = drawingState;
        }
    }
}
