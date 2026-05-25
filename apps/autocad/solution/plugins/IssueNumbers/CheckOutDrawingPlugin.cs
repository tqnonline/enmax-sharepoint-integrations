using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for atomically checking out a drawing.
    /// Custom API: enmax_acdnCheckOutDrawing (bound to enmax_autocaddrawing)
    ///
    /// Transitions Drawing: Available(1) → CheckedOut(2).
    /// Creates a new Open Checkout row.
    /// Uses ConcurrencyBehavior.IfRowVersionMatches to prevent two callers
    /// from checking out the same drawing simultaneously.
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

        private const int StateAvailable  = 1;
        private const int StateCheckedOut = 2;
        private const int StatusOpen      = 1;

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
            var service = localPluginContext.InitiatingUserService;

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
                    new ColumnSet(ColDrawingState));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException(
                    $"Could not retrieve drawing {target.Id}: {ex.Message}", ex);
            }

            int currentState = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;

            if (currentState != StateAvailable)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} cannot be checked out from state {currentState}. " +
                    $"Expected {StateAvailable} (Available).");

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

            // Create the checkout row
            var checkout = new Entity(CheckoutEntity)
            {
                [ColCheckoutStatus]  = new OptionSetValue(StatusOpen),
                [ColCheckoutDrawing] = new EntityReference(DrawingEntity, target.Id),
                [ColCheckedOutBy]    = new EntityReference("systemuser", context.InitiatingUserId),
                [ColCheckedOutOn]    = DateTime.UtcNow,
                [ColCheckoutName]    = $"CHK-{target.Id}",
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
    }
}
