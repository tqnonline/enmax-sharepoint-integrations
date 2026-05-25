using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Admin: mark a drawing Void (cancelled). Terminal.
    /// Custom API: enmax_acdnMarkVoid (bound to enmax_autocaddrawing)
    /// Guard: drawing non-terminal (not 5/6/7). Reason required (>=10 chars).
    /// </summary>
    public class MarkVoidPlugin : PluginBase
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string ColDrawingState = "enmax_acdnstate";
        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColSheetDrawing = "enmax_acdndrawing";
        private const string ColSheetState   = "enmax_acdnstate";
        private const string AuditEntity            = "enmax_autocadauditevent";
        private const int    AuditEventStateChanged = 2;
        private const int    AuditSourceAction      = 4;
        private const int    StateObsolete  = 5;
        private const int    StateVoid      = 6;
        private const int    StateFinalized = 7;
        private const int    SheetStateVoid = 6;

        public MarkVoidPlugin() : base(typeof(MarkVoidPlugin)) { }
        public MarkVoidPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(MarkVoidPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.InitiatingUserService;

            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as EntityReference : null;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");
            if (!string.Equals(target.LogicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"Target must be {DrawingEntity}, got {target.LogicalName}");

            string reason = context.InputParameters.Contains("Reason")
                ? context.InputParameters["Reason"] as string ?? string.Empty : string.Empty;
            if (reason.Trim().Length < 10)
                throw new InvalidPluginExecutionException("Reason must be at least 10 characters to void a drawing.");

            var drawing = service.Retrieve(DrawingEntity, target.Id, new ColumnSet(ColDrawingState));
            int currentState = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
            if (currentState == StateObsolete || currentState == StateVoid || currentState == StateFinalized)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} is already terminal (state {currentState}); cannot void.");

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

            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, target.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(SheetStateVoid) });

            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventStateChanged),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdntostate"]      = "Void",
                ["enmax_acdnreason"]       = reason.Trim(),
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Drawing {target.Id} voided",
            });
        }
    }
}
