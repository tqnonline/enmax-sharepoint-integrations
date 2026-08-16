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
    /// (a Drawing Number or a Procedure host for Forms). Children continue after the last existing
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
        private const string ColSheetState  = "enmax_acdnstate";
        private const int    SheetStateAvailable = 2;

        // Child items are hard-capped at 999 (the 3-digit -sss ceiling).
        private const int MaxChildItems = 999;

        public AddChildItemsPlugin() : base(typeof(AddChildItemsPlugin)) { }

        public AddChildItemsPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(AddChildItemsPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;
            var actorId = PluginActor.ResolveForCustomApi(context, service);

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
            Authorization.RequireApproverOrAdmin(service, actorId, "add items to an existing number");

            // ── Retrieve the base drawing ────────────────────────────────────────
            Entity drawing = service.Retrieve(DrawingEntity, drawingRef.Id, new ColumnSet(
                "enmax_acdnnumber",
                "enmax_acdnreservation",
                "ownerid",
                "enmax_acdnreservationtype",
                "enmax_acdndocumentsubtype"));

            string baseNumber = drawing.GetAttributeValue<string>("enmax_acdnnumber");
            var owner         = drawing.GetAttributeValue<EntityReference>("ownerid");

            // Guard: Standard / Drawing Document cannot take children. Procedure may —
            // Forms are Existing-only and append under a Procedure number.
            RejectIfCannotAppendChildren(service, drawing);

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
                    [ColSheetState]  = new OptionSetValue(SheetStateAvailable),
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
        /// Drawing/DrawingDocument and Document/Standard cannot take additional items.
        /// Document/Procedure is allowed as the host base for Form children (Form is
        /// Existing-only). Drawing/Drawing and Document/Form also allow append.
        /// </summary>
        private static void RejectIfCannotAppendChildren(IOrganizationService service, Entity drawing)
        {
            var drawingType = drawing.GetAttributeValue<OptionSetValue>("enmax_acdnreservationtype")?.Value;
            var drawingSubtype = drawing.GetAttributeValue<OptionSetValue>("enmax_acdndocumentsubtype")?.Value;
            if (RejectsChildAppend(drawingType, drawingSubtype))
                throw new InvalidPluginExecutionException(
                    "Drawing Documents and Standard documents are base-only and cannot take additional items.");

            var reservationRef = drawing.GetAttributeValue<EntityReference>("enmax_acdnreservation");
            if (reservationRef == null) return; // legacy drawing with no reservation link

            Entity reservation = service.Retrieve(ReservationEntity, reservationRef.Id, new ColumnSet(
                "enmax_acdnreservationtype",
                "enmax_acdndocumentsubtype"));

            var type    = reservation.GetAttributeValue<OptionSetValue>("enmax_acdnreservationtype")?.Value;
            var subtype = reservation.GetAttributeValue<OptionSetValue>("enmax_acdndocumentsubtype")?.Value;

            if (RejectsChildAppend(type, subtype))
                throw new InvalidPluginExecutionException(
                    "Drawing Documents and Standard documents are base-only and cannot take additional items.");
        }

        /// <summary>
        /// True when this taxonomy must not receive -SSS children via AddChildItems.
        /// Procedure is excluded — it hosts Form appends.
        /// </summary>
        private static bool RejectsChildAppend(int? reservationType, int? documentSubtype)
        {
            var subtype = TaxonomyConstants.NormalizeDocumentSubtype(reservationType, documentSubtype);
            if (reservationType == TaxonomyConstants.ReservationType.Document)
                return subtype == TaxonomyConstants.DocumentSubtype.Standard;
            if (reservationType == TaxonomyConstants.ReservationType.Drawing)
                return subtype == TaxonomyConstants.DocumentSubtype.DrawingDocument;
            return false;
        }
    }
}
