using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Linq;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for the "Add to Existing" flow (ADR 0001 #2/#6).
    /// Custom API: enmax_acdnAddChildItems (unbound; explicit Drawing input).
    ///
    /// Appends the next N child items (-sss) to an already-issued base number
    /// (a Drawing or a Procedure). Children continue after the last existing
    /// child: given a base with max sheet number M, this creates M+1 .. M+N.
    ///
    /// Concurrency (CLAUDE.md Rule 14): there is no per-drawing counter, so the
    /// next index is derived from the current max sheet number. The alt key
    /// enmax_acdnsheet_drawing_num_ak (drawing, sheetnumber) is the backstop — a
    /// racing caller that computes the same M throws DuplicateDetected on the
    /// overlapping index. As with IssueNumbersPlugin, this plug-in does NOT catch
    /// service faults; the caller retries the whole invocation and recomputes M.
    ///
    /// Standard documents are base-only (ADR 0001 #1) and are rejected here.
    /// </summary>
    public class AddChildItemsPlugin : PluginBase
    {
        private const string ReservationEntity = "enmax_autocadreservation";
        private const string DrawingEntity      = "enmax_autocaddrawing";
        private const string SheetEntity        = "enmax_autocadsheet";

        private const string ColSheetNumber = "enmax_acdnsheetnumber";
        private const string ColDrawing     = "enmax_acdndrawing";

        // Child items are hard-capped at 999 (the 3-digit -sss ceiling).
        private const int MaxChildItems = 999;

        private const int ReservationTypeDocument = 2;
        private const int DocumentSubtypeStandard = 1;

        public AddChildItemsPlugin() : base(typeof(AddChildItemsPlugin)) { }

        public AddChildItemsPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(AddChildItemsPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;

            // ── Validate inputs ──────────────────────────────────────────────────
            if (!context.InputParameters.Contains("Drawing"))
                throw new InvalidPluginExecutionException("Missing required input: Drawing");
            var drawingRef = context.InputParameters["Drawing"] as EntityReference;
            if (drawingRef == null)
                throw new InvalidPluginExecutionException("Missing required input: Drawing");
            if (!string.Equals(drawingRef.LogicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException(
                    $"Drawing must be {DrawingEntity}, got {drawingRef.LogicalName}");

            if (!context.InputParameters.Contains("Count"))
                throw new InvalidPluginExecutionException("Missing required input: Count");
            int count = context.InputParameters["Count"] is int c
                ? c
                : throw new InvalidPluginExecutionException("Count must be an integer");
            if (count < 1 || count > MaxChildItems)
                throw new InvalidPluginExecutionException(
                    $"Count must be between 1 and {MaxChildItems}");

            // Issuance is an approver/admin authority (Rule 14), matching CreateDrawings.
            Authorization.RequireApproverOrAdmin(service, context.InitiatingUserId, "add items to an existing number");

            // ── Retrieve the base drawing ────────────────────────────────────────
            Entity drawing = service.Retrieve(DrawingEntity, drawingRef.Id, new ColumnSet(
                "enmax_acdnnumber",
                "enmax_acdnreservation",
                "ownerid"));

            string baseNumber = drawing.GetAttributeValue<string>("enmax_acdnnumber");
            var owner         = drawing.GetAttributeValue<EntityReference>("ownerid");

            // Guard: Standard documents are base-only and cannot take child items.
            RejectIfBaseOnlyStandard(service, drawing);

            // ── Determine the next index from the current max child (-sss) ────────
            int maxSheet = GetMaxSheetNumber(service, drawingRef.Id);
            int firstNew = maxSheet + 1;
            int lastNew  = maxSheet + count;
            if (lastNew > MaxChildItems)
                throw new InvalidPluginExecutionException(
                    $"Adding {count} item(s) to {baseNumber} would exceed the {MaxChildItems}-item limit " +
                    $"(currently {maxSheet}).");

            // ── Append children ──────────────────────────────────────────────────
            // No catch/continue: a DuplicateDetected from a concurrent add propagates
            // so the caller retries and recomputes maxSheet.
            for (int i = firstNew; i <= lastNew; i++)
            {
                var sheet = new Entity(SheetEntity)
                {
                    [ColDrawing]     = new EntityReference(DrawingEntity, drawingRef.Id),
                    [ColSheetNumber] = i,
                };
                if (owner != null) sheet["ownerid"] = owner;
                service.Create(sheet);
            }

            context.OutputParameters["ChildrenCreated"]  = count;
            context.OutputParameters["FirstChildNumber"] = firstNew;
            context.OutputParameters["LastChildNumber"]  = lastNew;
            context.OutputParameters["BaseNumber"]       = baseNumber ?? string.Empty;
        }

        /// <summary>
        /// Highest existing child index for the drawing, or 0 when it has none.
        /// </summary>
        private static int GetMaxSheetNumber(IOrganizationService service, Guid drawingId)
        {
            var query = new QueryExpression(SheetEntity)
            {
                ColumnSet = new ColumnSet(ColSheetNumber),
            };
            query.Criteria.AddCondition(ColDrawing, ConditionOperator.Equal, drawingId);

            var existing = service.RetrieveMultiple(query).Entities;
            if (existing.Count == 0) return 0;

            return existing.Max(e => e.GetAttributeValue<int>(ColSheetNumber));
        }

        /// <summary>
        /// Document/Standard reservations are base-only (ADR 0001 #1). If the base
        /// drawing traces to a Standard reservation, reject the append.
        /// </summary>
        private static void RejectIfBaseOnlyStandard(IOrganizationService service, Entity drawing)
        {
            var reservationRef = drawing.GetAttributeValue<EntityReference>("enmax_acdnreservation");
            if (reservationRef == null) return; // legacy drawing with no reservation link

            Entity reservation = service.Retrieve(ReservationEntity, reservationRef.Id, new ColumnSet(
                "enmax_acdnreservationtype",
                "enmax_acdndocumentsubtype"));

            var type    = reservation.GetAttributeValue<OptionSetValue>("enmax_acdnreservationtype")?.Value;
            var subtype = reservation.GetAttributeValue<OptionSetValue>("enmax_acdndocumentsubtype")?.Value;

            if (type == ReservationTypeDocument && subtype == DocumentSubtypeStandard)
                throw new InvalidPluginExecutionException(
                    "Standard documents are base-only and cannot take additional items.");
        }
    }
}
