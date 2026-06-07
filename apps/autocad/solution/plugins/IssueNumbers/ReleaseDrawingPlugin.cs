using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// F-06: Release an unused reserved drawing number. Caller releases own Available
    /// drawing (self-release: State Changed audit, no notification); admin releases
    /// anyone's (force-release: Override Used audit + in-app notification to the owner).
    /// Drawing + sheets transition to Void; the sequence value stays burned (F-39 — not reused).
    /// Custom API: enmax_acdnReleaseDrawing (bound to enmax_autocaddrawing).
    /// Authorization is record-level (ownerid vs caller); no in-plug-in role checks (suite convention).
    /// </summary>
    public class ReleaseDrawingPlugin : PluginBase
    {
        private const string DrawingEntity    = "enmax_autocaddrawing";
        private const string ColDrawingState  = "enmax_acdnstate";
        private const string ColDrawingNumber = "enmax_acdnnumber";
        private const string ColOwner         = "ownerid";
        private const string SheetEntity      = "enmax_autocadsheet";
        private const string ColSheetDrawing  = "enmax_acdndrawing";
        private const string ColSheetState    = "enmax_acdnstate";
        private const string CheckoutEntity     = "enmax_autocadcheckout";
        private const string ColCheckoutDrawing = "enmax_acdndrawing";
        private const string AuditEntity      = "enmax_autocadauditevent";
        private const string NotifEntity      = "enmax_autocadinappnotification";

        private const int StateAvailable = 1;
        private const int StateVoid      = 6;
        private const int SheetStateVoid = 6;

        private const int AuditStateChanged = 2;
        private const int AuditOverrideUsed = 5;
        private const int AuditSourceAction = 4;

        private const int NotifSeverityWarning = 3;
        private const int NotifSourceSystem    = 8;

        public ReleaseDrawingPlugin() : base(typeof(ReleaseDrawingPlugin)) { }
        public ReleaseDrawingPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ReleaseDrawingPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;

            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as EntityReference : null;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");
            if (!string.Equals(target.LogicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"Target must be {DrawingEntity}, got {target.LogicalName}");

            string reason = context.InputParameters.Contains("Reason")
                ? context.InputParameters["Reason"] as string ?? string.Empty : string.Empty;
            if (reason.Trim().Length < 10)
                throw new InvalidPluginExecutionException("Reason must be at least 10 characters to release a drawing.");

            var drawing = service.Retrieve(DrawingEntity, target.Id,
                new ColumnSet(ColDrawingState, ColDrawingNumber, ColOwner));
            int currentState = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
            if (currentState != StateAvailable)
                throw new InvalidPluginExecutionException(
                    $"Only Available drawings can be released; drawing {target.Id} is in state {currentState}.");

            // Business rule: a drawing that was ever checked out is "used" — the number
            // cannot be released/voided (even if it has cycled back to Available). Use
            // Mark Obsolete to retire a used drawing.
            var checkoutProbe = new QueryExpression(CheckoutEntity)
            {
                ColumnSet = new ColumnSet(false),
                TopCount  = 1,
            };
            checkoutProbe.Criteria.AddCondition(ColCheckoutDrawing, ConditionOperator.Equal, target.Id);
            if (service.RetrieveMultiple(checkoutProbe).Entities.Count > 0)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} has been checked out and cannot be released. Use Mark Obsolete to retire a used drawing.");

            var owner    = drawing.GetAttributeValue<EntityReference>(ColOwner);
            var callerId = context.InitiatingUserId;
            bool isForce = owner == null || owner.Id != callerId;
            string number = drawing.GetAttributeValue<string>(ColDrawingNumber) ?? string.Empty;

            // Force-release (caller != owner) requires admin rights — check before any mutation.
            if (isForce)
                Authorization.RequireAdmin(service, callerId, "force-release this drawing");

            // Available -> Void with optimistic concurrency
            try
            {
                service.Execute(new UpdateRequest
                {
                    Target = new Entity(DrawingEntity, target.Id)
                    {
                        RowVersion        = drawing.RowVersion,
                        [ColDrawingState] = new OptionSetValue(StateVoid),
                    },
                    ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
                });
            }
            catch (FaultException<OrganizationServiceFault> ex)
                when (ex.Detail?.ErrorCode == -2147088254 ||
                      (ex.Message != null && ex.Message.Contains("ConcurrencyVersionMismatch")))
            {
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} was concurrently modified (ConcurrencyVersionMismatch). Retry.", ex);
            }

            // Propagate Void to child sheets
            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, target.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(SheetStateVoid) });

            if (isForce)
            {
                string ownerNote = owner != null
                    ? $" [Force-released; originally owned by {owner.Name}]"
                    : " [Force-released]";
                service.Create(new Entity(AuditEntity)
                {
                    ["enmax_acdnevent"]        = new OptionSetValue(AuditOverrideUsed),
                    ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                    ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                    ["enmax_acdnsubjecttable"] = DrawingEntity,
                    ["enmax_acdnfromstate"]    = "Available",
                    ["enmax_acdntostate"]      = "Void",
                    ["enmax_acdnreason"]       = reason.Trim() + ownerNote,
                    ["enmax_acdnactedby"]      = new EntityReference("systemuser", callerId),
                    ["enmax_acdnname"]         = $"Drawing {target.Id} force-released by admin",
                });

                if (owner != null)
                    service.Create(new Entity(NotifEntity)
                    {
                        ["enmax_acdntitle"]        = "A reserved drawing was released",
                        ["enmax_acdnbody"]         = $"An administrator released drawing {number}. The number stays reserved and will not be reused.",
                        ["enmax_acdnseverity"]     = new OptionSetValue(NotifSeverityWarning),
                        ["enmax_acdnsourceevent"]  = new OptionSetValue(NotifSourceSystem),
                        ["enmax_acdnsubjecttable"] = DrawingEntity,
                        ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                        ["enmax_acdndeeplinkpath"] = "/my-items",
                        ["enmax_acdnread"]         = false,
                        ["enmax_acdnrecipient"]    = new EntityReference("systemuser", owner.Id),
                        ["ownerid"]                = new EntityReference("systemuser", owner.Id),
                    });
            }
            else
            {
                service.Create(new Entity(AuditEntity)
                {
                    ["enmax_acdnevent"]        = new OptionSetValue(AuditStateChanged),
                    ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                    ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                    ["enmax_acdnsubjecttable"] = DrawingEntity,
                    ["enmax_acdnfromstate"]    = "Available",
                    ["enmax_acdntostate"]      = "Void",
                    ["enmax_acdnreason"]       = reason.Trim(),
                    ["enmax_acdnactedby"]      = new EntityReference("systemuser", callerId),
                    ["enmax_acdnname"]         = $"Drawing {target.Id} released",
                });
            }

            context.OutputParameters["DrawingId"]         = target.Id.ToString();
            context.OutputParameters["NewState"]          = "Void";
            context.OutputParameters["SequenceKeyBurned"] = number;
        }
    }
}
