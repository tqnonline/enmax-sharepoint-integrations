using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for admin force close of an open checkout.
    /// Custom API: enmax_acdnForceCheckin (bound to enmax_autocadcheckout)
    ///
    /// Closes a Checkout regardless of its current status (idempotent if already closed).
    /// Transitions Drawing → Available(1).
    /// </summary>
    public class ForceCheckinPlugin : PluginBase
    {
        // -----------------------------------------------------------------------
        // Constants
        // -----------------------------------------------------------------------

        private const string CheckoutEntity       = "enmax_autocadcheckout";
        private const string ColCheckoutStatus    = "enmax_acdnstatus";
        private const string ColCheckoutDrawing   = "enmax_acdndrawing";
        private const string ColClosedBy          = "enmax_acdnclosedby";
        private const string ColClosedOn          = "enmax_acdnclosedon";
        private const string ColValidationReason  = "enmax_acdnvalidationreason";

        private const string DrawingEntity        = "enmax_autocaddrawing";
        private const string ColDrawingState      = "enmax_acdnstate";

        private const string AuditEntity          = "enmax_autocadauditevent";
        private const int    AuditEventForced     = 6;
        private const int    AuditSourceAction    = 4;

        private const int StatusClosedApproved = 3;
        private const int StatusClosedDeclined = 4;
        private const int StatusClosedForced   = 5;

        private const int StateAvailable = 1;

        // -----------------------------------------------------------------------
        // Constructors
        // -----------------------------------------------------------------------

        public ForceCheckinPlugin() : base(typeof(ForceCheckinPlugin)) { }

        public ForceCheckinPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ForceCheckinPlugin)) { }

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

            string reason = context.InputParameters.Contains("Reason")
                ? context.InputParameters["Reason"] as string ?? string.Empty
                : string.Empty;

            if (string.IsNullOrWhiteSpace(reason))
                throw new InvalidPluginExecutionException("Reason is required for Force Check-In.");

            localPluginContext.Trace(
                $"ForceCheckin: checkout={target.Id}, user={context.InitiatingUserId}");

            // Retrieve checkout + drawing FK
            Entity checkout;
            try
            {
                checkout = service.Retrieve(CheckoutEntity, target.Id,
                    new ColumnSet(ColCheckoutStatus, ColCheckoutDrawing));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException(
                    $"Could not retrieve checkout {target.Id}: {ex.Message}", ex);
            }

            int currentStatus = checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus)?.Value ?? 0;

            // Idempotent — already closed is a no-op (return current drawing state)
            if (currentStatus == StatusClosedApproved ||
                currentStatus == StatusClosedDeclined  ||
                currentStatus == StatusClosedForced)
            {
                localPluginContext.Trace($"Checkout {target.Id} already closed (status={currentStatus}); no-op.");
                context.OutputParameters["CheckoutId"]   = target.Id.ToString();
                context.OutputParameters["DrawingState"] = StateAvailable;
                return;
            }

            var drawingRef = checkout.GetAttributeValue<EntityReference>(ColCheckoutDrawing);
            if (drawingRef == null)
                throw new InvalidPluginExecutionException(
                    $"Checkout {target.Id} has no associated drawing.");

            // Close the checkout
            service.Update(new Entity(CheckoutEntity, target.Id)
            {
                [ColCheckoutStatus]  = new OptionSetValue(StatusClosedForced),
                [ColClosedOn]        = DateTime.UtcNow,
                [ColClosedBy]        = new EntityReference("systemuser", context.InitiatingUserId),
                [ColValidationReason] = reason,
            });

            // Return drawing to Available
            service.Update(new Entity(DrawingEntity, drawingRef.Id)
            {
                [ColDrawingState] = new OptionSetValue(StateAvailable),
            });

            localPluginContext.Trace($"Checkout {target.Id} force-closed; drawing {drawingRef.Id} Available.");

            // Audit
            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventForced),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = CheckoutEntity,
                ["enmax_acdnfromstate"]    = currentStatus.ToString(),
                ["enmax_acdntostate"]      = "ClosedForced",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Checkout {target.Id} force closed by admin",
            });

            context.OutputParameters["CheckoutId"]   = target.Id.ToString();
            context.OutputParameters["DrawingState"] = StateAvailable;
        }
    }
}
