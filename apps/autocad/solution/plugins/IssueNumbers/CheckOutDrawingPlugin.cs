using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Linq;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Backward-compatible drawing-level checkout.
    /// Custom API: enmax_acdnCheckOutDrawing (bound to enmax_autocaddrawing)
    /// Delegates to sheet-level checkout across all currently available sheets.
    /// </summary>
    public class CheckOutDrawingPlugin : PluginBase
    {
        private const string DrawingEntity = "enmax_autocaddrawing";
        private const string SheetEntity = "enmax_autocadsheet";
        private const string ColSheetDrawing = "enmax_acdndrawing";
        private const string ColSheetState = "enmax_acdnstate";
        private const int SheetStateAvailable = 2;

        public CheckOutDrawingPlugin() : base(typeof(CheckOutDrawingPlugin)) { }

        public CheckOutDrawingPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(CheckOutDrawingPlugin)) { }

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
            if (!string.Equals(target.LogicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"Target must be {DrawingEntity}, got {target.LogicalName}");

            var drawing = service.Retrieve(DrawingEntity, target.Id, new ColumnSet("ownerid"));
            Authorization.RequireOwnerOrAdmin(
                service,
                drawing.GetAttributeValue<EntityReference>("ownerid")?.Id ?? Guid.Empty,
                actorId,
                "check out this drawing");

            var q = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            q.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, target.Id);
            q.Criteria.AddCondition(ColSheetState, ConditionOperator.Equal, SheetStateAvailable);
            var sheets = service.RetrieveMultiple(q).Entities.Select(e => e.Id).ToList();

            if (sheets.Count == 0)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} has no available sheets to check out.");

            var checkoutIds = CheckOutSheetsPlugin.CheckoutSheets(localPluginContext, service, context, sheets, null, actorId);
            context.OutputParameters["CheckoutIds"] = checkoutIds.Select(id => id.ToString()).ToArray();
            context.OutputParameters["CheckoutId"] = checkoutIds[0].ToString();
        }
    }
}
