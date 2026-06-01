using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
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

        private const string ColCurrentRevision  = "enmax_acdncurrentrevision";
        private const string SheetEntity          = "enmax_autocadsheet";
        private const string ColSheetDrawing      = "enmax_acdndrawing";
        private const string ColSheetState        = "enmax_acdnstate";
        private const int    SheetStateAvailable  = 2;

        private const string ColCheckoutOwner   = "ownerid";
        private const int    NotifSeverityWarning   = 2;
        private const int    NotifSourceForceCheckin = 7;
        private const string CheckinDeepLink = "/my-items?tab=checkouts";

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

            string newRevision = context.InputParameters.Contains("NewRevision")
                ? context.InputParameters["NewRevision"] as string : null;
            if (string.IsNullOrWhiteSpace(newRevision))
                throw new InvalidPluginExecutionException("Missing required input: NewRevision");
            newRevision = newRevision.Trim();

            localPluginContext.Trace(
                $"ForceCheckin: checkout={target.Id}, user={context.InitiatingUserId}");

            // Retrieve checkout + drawing FK
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

            // Return drawing to Available with RowVersion guard + bump revision
            var drawing = service.Retrieve(DrawingEntity, drawingRef.Id, new ColumnSet(ColDrawingState));
            try
            {
                service.Execute(new UpdateRequest
                {
                    Target = new Entity(DrawingEntity, drawingRef.Id)
                    {
                        RowVersion           = drawing.RowVersion,
                        [ColDrawingState]    = new OptionSetValue(StateAvailable),
                        [ColCurrentRevision] = newRevision,
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

            // Propagate state to sheets
            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, drawingRef.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(SheetStateAvailable) });

            localPluginContext.Trace($"Checkout {target.Id} force-closed; drawing {drawingRef.Id} Available.");

            // Audit
            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventForced),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = drawingRef.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdnfromstate"]    = "CheckedOut",
                ["enmax_acdntostate"]      = "Available",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Checkout {target.Id} force closed by admin",
            });

            // Notify the user whose check-out was force-closed.
            var submitter = checkout.GetAttributeValue<EntityReference>(ColCheckoutOwner);
            if (submitter != null && submitter.Id != context.InitiatingUserId)
            {
                string number = NotificationWriter.ResolveDrawingNumber(service, drawingRef.Id);
                NotificationWriter.Create(service, submitter.Id,
                    title:        $"Your check-out was force-closed: {number}",
                    body:         $"An administrator force-checked-in drawing {number} (revision {newRevision}). Reason: {reason}",
                    severity:     NotifSeverityWarning,
                    sourceEvent:  NotifSourceForceCheckin,
                    subjectTable: CheckoutEntity,
                    subjectId:    target.Id.ToString(),
                    deepLinkPath: CheckinDeepLink);
            }

            context.OutputParameters["CheckoutId"]   = target.Id.ToString();
            context.OutputParameters["DrawingState"] = StateAvailable;
        }
    }
}
