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
        private const string ColCheckoutSheet        = "enmax_acdnsheet";
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

        private const string SheetEntity           = CheckOutSheetsPlugin.SheetEntity;
        private const string ColSheetState         = "enmax_acdnstate";
        private const int    SheetStateAvailable   = 2;
        private const int    SheetStateCheckedOut  = 3;

        private const string ColCheckoutOwner = "ownerid";
        private const int NotifSeverityInfo           = 1;
        private const int NotifSeverityWarning        = 2;
        private const int NotifSourceCheckinValidated = 3;
        private const int NotifSourceCheckinDeclined  = 4;
        private const string CheckinDeepLink = "/my-items?tab=checkouts";

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
            var service = localPluginContext.SystemUserService;
            var actorId = PluginActor.ResolveForCustomApi(context, service);

            if (!context.InputParameters.Contains("Target"))
                throw new InvalidPluginExecutionException("Missing required input: Target");

            var target = context.InputParameters["Target"] as EntityReference;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");

            if (!string.Equals(target.LogicalName, CheckoutEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException(
                    $"Target must be {CheckoutEntity}, got {target.LogicalName}");

            Authorization.RequireApproverOrAdmin(service, actorId, "validate a check-in");

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
                $"ApproveCheckin: checkout={target.Id}, decision={decision}, user={actorId}");

            // Retrieve checkout + drawing FK
            Entity checkout;
            try
            {
                checkout = service.Retrieve(CheckoutEntity, target.Id,
                    new ColumnSet(ColCheckoutStatus, ColCheckoutDrawing, ColCheckoutSheet, ColNewRevision, ColCheckoutOwner));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException(
                    $"Could not retrieve checkout {target.Id}: {ex.Message}", ex);
            }

            int currentStatus = checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus)?.Value ?? 0;

            if (currentStatus == StatusClosedApproved)
            {
                localPluginContext.Trace($"Checkout {target.Id} already ClosedApproved — idempotent no-op.");
                context.OutputParameters["CheckoutId"]   = target.Id.ToString();
                context.OutputParameters["NewStatus"]    = StatusClosedApproved;
                context.OutputParameters["DrawingState"] = StateAvailable;
                return;
            }

            if (currentStatus != StatusAwaitingValidation)
                throw new InvalidPluginExecutionException(
                    $"Checkout {target.Id} cannot be reviewed from status {currentStatus}. " +
                    $"Expected {StatusAwaitingValidation} (AwaitingValidation).");

            var sheetRef = checkout.GetAttributeValue<EntityReference>(ColCheckoutSheet);
            if (sheetRef == null)
                throw new InvalidPluginExecutionException($"Checkout {target.Id} has no associated sheet.");
            var sheet = service.Retrieve(SheetEntity, sheetRef.Id, new ColumnSet("enmax_acdndrawing"));
            var drawingRef = sheet.GetAttributeValue<EntityReference>("enmax_acdndrawing")
                ?? checkout.GetAttributeValue<EntityReference>(ColCheckoutDrawing);
            if (drawingRef == null)
                throw new InvalidPluginExecutionException($"Checkout {target.Id} has no associated drawing.");

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
                    [ColClosedBy]       = new EntityReference("systemuser", actorId),
                });

                var drawingUpdate = new Entity(DrawingEntity, drawingRef.Id)
                {
                    [ColCurrentRevision] = newRevision,
                };
                service.Update(drawingUpdate);

                service.Update(new Entity(SheetEntity, sheetRef.Id)
                {
                    [ColSheetState] = new OptionSetValue(SheetStateAvailable),
                });

                newStatus   = StatusClosedApproved;
                auditEvent  = AuditEventApproved;
                drawingState = DrawingRollupHelper.RecomputeDrawingRollup(service, drawingRef.Id);

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

                service.Update(new Entity(SheetEntity, sheetRef.Id)
                {
                    [ColSheetState] = new OptionSetValue(SheetStateCheckedOut),
                });

                newStatus    = StatusOpen;
                auditEvent   = AuditEventDeclined;
                drawingState = DrawingRollupHelper.RecomputeDrawingRollup(service, drawingRef.Id);

                localPluginContext.Trace($"Checkout {target.Id} declined; drawing {drawingRef.Id} reverted to CheckedOut.");
            }

            // Audit
            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(auditEvent),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = sheetRef.Id.ToString(),
                ["enmax_acdnsubjecttable"] = SheetEntity,
                ["enmax_acdnfromstate"]    = "AwaitingValidation",
                ["enmax_acdntostate"]      = decision == DecisionApproved ? "Available" : "CheckedOut",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", actorId),
                ["enmax_acdnname"]         = $"Checkout {target.Id} {(decision == DecisionApproved ? "approved" : "declined")}",
            });

            // Notify the submitter of the validation outcome.
            var submitter = checkout.GetAttributeValue<EntityReference>(ColCheckoutOwner);
            if (submitter != null && submitter.Id != actorId)
            {
                string number = NotificationWriter.ResolveDrawingNumber(service, drawingRef.Id);
                if (decision == DecisionApproved)
                    NotificationWriter.Create(service, submitter.Id,
                        title:        $"Check-in approved: {number}",
                        body:         $"Your check-in of drawing {number} was validated. The drawing is now Available.",
                        severity:     NotifSeverityInfo,
                        sourceEvent:  NotifSourceCheckinValidated,
                        subjectTable: CheckoutEntity,
                        subjectId:    target.Id.ToString(),
                        deepLinkPath: CheckinDeepLink);
                else
                    NotificationWriter.Create(service, submitter.Id,
                        title:        $"Check-in needs changes: {number}",
                        body:         string.IsNullOrWhiteSpace(reason)
                                        ? $"Your check-in of drawing {number} was declined. It is checked out to you again."
                                        : $"Your check-in of drawing {number} was declined: {reason}",
                        severity:     NotifSeverityWarning,
                        sourceEvent:  NotifSourceCheckinDeclined,
                        subjectTable: CheckoutEntity,
                        subjectId:    target.Id.ToString(),
                        deepLinkPath: CheckinDeepLink);
            }

            context.OutputParameters["CheckoutId"]  = target.Id.ToString();
            context.OutputParameters["NewStatus"]   = newStatus;
            context.OutputParameters["DrawingState"] = drawingState;
        }

    }
}
