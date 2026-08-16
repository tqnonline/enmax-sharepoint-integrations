using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    public static class DrawingRollupHelper
    {
        private const string DrawingEntity = "enmax_autocaddrawing";
        private const string SheetEntity = "enmax_autocadsheet";
        private const string ColDrawingState = "enmax_acdnstate";
        private const string ColSheetDrawing = "enmax_acdndrawing";
        private const string ColSheetState = "enmax_acdnstate";

        private const int DrawingStateAvailable = 1;
        private const int DrawingStateCheckedOut = 2;
        private const int DrawingStateAwaitingValidation = 3;

        private const int SheetStateCheckedOut = 3;
        private const int SheetStateAwaitingValidation = 4;

        private static readonly HashSet<int> TerminalSheetStates = new HashSet<int> { 5, 6, 7 };

        public static int RecomputeDrawingRollup(IOrganizationService service, Guid drawingId)
        {
            // One recompute-and-retry absorbs a single concurrent sheet transition on the
            // same drawing; a second mismatch surfaces so the caller can retry the API.
            try
            {
                return TryRecomputeDrawingRollup(service, drawingId);
            }
            catch (FaultException<OrganizationServiceFault> ex)
                when (IsConcurrencyMismatch(ex))
            {
                try
                {
                    return TryRecomputeDrawingRollup(service, drawingId);
                }
                catch (FaultException<OrganizationServiceFault> retryEx)
                    when (IsConcurrencyMismatch(retryEx))
                {
                    throw new InvalidPluginExecutionException(
                        $"Drawing {drawingId} was concurrently modified (ConcurrencyVersionMismatch). Retry.",
                        retryEx);
                }
            }
        }

        private static int TryRecomputeDrawingRollup(IOrganizationService service, Guid drawingId)
        {
            var drawing = service.Retrieve(
                DrawingEntity,
                drawingId,
                new ColumnSet(ColDrawingState, "versionnumber"));
            var targetState = ComputeTargetState(service, drawingId);
            var currentState = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
            if (currentState == targetState)
            {
                return targetState;
            }

            var update = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState] = new OptionSetValue(targetState),
            };

            var drawingRowVersion = drawing.RowVersion;
            if (string.IsNullOrWhiteSpace(drawingRowVersion) &&
                drawing.Contains("versionnumber"))
            {
                drawingRowVersion = drawing
                    .GetAttributeValue<long>("versionnumber")
                    .ToString(CultureInfo.InvariantCulture);
            }

            if (!string.IsNullOrWhiteSpace(drawingRowVersion))
            {
                update.RowVersion = drawingRowVersion;
                service.Execute(new UpdateRequest
                {
                    Target = update,
                    ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
                });
            }
            else
            {
                service.Update(update);
            }

            return targetState;
        }

        private static bool IsConcurrencyMismatch(FaultException<OrganizationServiceFault> ex)
        {
            return ex.Detail?.ErrorCode == -2147088254 ||
                   (ex.Message != null && ex.Message.Contains("ConcurrencyVersionMismatch"));
        }

        private static int ComputeTargetState(IOrganizationService service, Guid drawingId)
        {
            var q = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet(ColSheetState) };
            q.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, drawingId);
            var sheets = service.RetrieveMultiple(q).Entities;
            if (sheets.Count == 0) return DrawingStateAvailable;

            var states = sheets
                .Select(s => s.GetAttributeValue<OptionSetValue>(ColSheetState)?.Value ?? 0)
                .ToList();

            if (states.Any(s => s == SheetStateCheckedOut)) return DrawingStateCheckedOut;
            if (states.Any(s => s == SheetStateAwaitingValidation)) return DrawingStateAwaitingValidation;

            var first = states[0];
            if (states.All(s => s == first) && TerminalSheetStates.Contains(first))
                return first;

            return DrawingStateAvailable;
        }
    }
}
