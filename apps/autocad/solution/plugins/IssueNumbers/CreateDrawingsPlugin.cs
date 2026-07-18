using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using System;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for creating Drawing and Sheet records after number issuance.
    /// Custom API: enmax_acdnCreateDrawings (bound to enmax_autocadreservation)
    ///
    /// Creates one Drawing per issued number and N Sheet records per drawing,
    /// where N = enmax_acdnsheetsperdrawing on the reservation (defaults to 1).
    /// Owner of all created records is set to the reservation owner so drawings
    /// belong to the requester, not the approver.
    /// </summary>
    public class CreateDrawingsPlugin : PluginBase
    {
        private const string ReservationEntity = "enmax_autocadreservation";
        private const string DrawingEntity     = "enmax_autocaddrawing";
        private const string SheetEntity       = "enmax_autocadsheet";

        private const int StateAvailable = 1;
        private const int SheetStateAvailable = 2;

        // Type-aware issuance (ADR 0001, docs/drawing-document-subtype-CONTRACT.md).
        // Base-only (singleton sheet, no numbered -sss): Drawing/DrawingDocument or
        // Document/Standard or Document/Procedure. Numbered children: Drawing/Drawing,
        // Document/Form, or legacy reservations with no type/subtype set.
        // Child items are hard-capped at 999 (the 3-digit -sss ceiling), default 1.
        private const int MaxChildItems = 999;

        public CreateDrawingsPlugin() : base(typeof(CreateDrawingsPlugin)) { }

        public CreateDrawingsPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(CreateDrawingsPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;
            var actorId = PluginActor.ResolveForCustomApi(context, service);

            // ── Validate inputs ──────────────────────────────────────────────────
            if (!context.InputParameters.Contains("Target"))
                throw new InvalidPluginExecutionException("Missing required input: Target");
            var target = context.InputParameters["Target"] as EntityReference;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");
            if (!string.Equals(target.LogicalName, ReservationEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException(
                    $"Target must be {ReservationEntity}, got {target.LogicalName}");

            Authorization.RequireApproverOrAdmin(service, actorId, "create drawings");

            if (!context.InputParameters.Contains("IssuedNumbers"))
                throw new InvalidPluginExecutionException("Missing required input: IssuedNumbers");
            var issuedNumbersJson = context.InputParameters["IssuedNumbers"] as string;
            if (string.IsNullOrWhiteSpace(issuedNumbersJson))
                throw new InvalidPluginExecutionException("IssuedNumbers must not be empty");

            if (!context.InputParameters.Contains("SequenceKey"))
                throw new InvalidPluginExecutionException("Missing required input: SequenceKey");
            var sequenceKey = context.InputParameters["SequenceKey"] as string;
            if (string.IsNullOrWhiteSpace(sequenceKey))
                throw new InvalidPluginExecutionException("SequenceKey must not be empty");

            int[] numbers;
            try { numbers = JsonConvert.DeserializeObject<int[]>(issuedNumbersJson); }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException(
                    $"IssuedNumbers is not valid JSON: {ex.Message}", ex);
            }
            if (numbers == null || numbers.Length == 0)
                throw new InvalidPluginExecutionException(
                    "IssuedNumbers must contain at least one number");

            // ── Retrieve reservation ─────────────────────────────────────────────
            Entity reservation = service.Retrieve(ReservationEntity, target.Id, new ColumnSet(
                "ownerid",
                "enmax_acdnsheetsperdrawing",
                "enmax_acdnreservationtype",
                "enmax_acdndocumentsubtype",
                "enmax_acdnbusiness",
                "enmax_acdnasset",
                "enmax_acdnunit",
                "enmax_acdndomain",
                "enmax_acdnsystem",
                "enmax_acdnkind"));

            var owner = reservation.GetAttributeValue<EntityReference>("ownerid");

            bool createChildren = CreatesChildItems(reservation);
            bool createSingletonStandardSheet = IsBaseOnlyDocument(reservation);
            int sheetsPer = reservation.Contains("enmax_acdnsheetsperdrawing")
                ? reservation.GetAttributeValue<int>("enmax_acdnsheetsperdrawing")
                : 0;
            int sheetCount = Math.Min(Math.Max(sheetsPer, 1), MaxChildItems);
            int issuedSheetCount = createChildren ? sheetCount : 1;

            // ── Create drawings + sheets ─────────────────────────────────────────
            int drawingsCreated = 0;
            foreach (int number in numbers)
            {
                var drawing = new Entity(DrawingEntity)
                {
                    ["enmax_acdnnumber"]         = $"{sequenceKey}-{number:D4}",
                    ["enmax_acdnsequencenumber"] = number,
                    ["enmax_acdnstate"]          = new OptionSetValue(StateAvailable),
                    ["enmax_acdnreservation"]    = new EntityReference(ReservationEntity, target.Id),
                    ["enmax_acdnsheetcount"]     = issuedSheetCount,
                };

                if (owner != null)                                    drawing["ownerid"]          = owner;
                CopyLookup(reservation, drawing, "enmax_acdnbusiness");
                CopyLookup(reservation, drawing, "enmax_acdnasset");
                CopyLookup(reservation, drawing, "enmax_acdnunit");
                CopyLookup(reservation, drawing, "enmax_acdndomain");
                CopyLookup(reservation, drawing, "enmax_acdnsystem");
                CopyLookup(reservation, drawing, "enmax_acdnkind");
                // Denormalize the taxonomy onto the record so a base item is
                // self-identifying without joining back to its reservation (ADR 0001).
                CopyLookup(reservation, drawing, "enmax_acdnreservationtype");
                CopyLookup(reservation, drawing, "enmax_acdndocumentsubtype");

                Guid drawingId = service.Create(drawing);
                drawingsCreated++;

                if (createChildren || createSingletonStandardSheet)
                {
                    int loops = createChildren ? sheetCount : 1;
                    for (int i = 1; i <= loops; i++)
                    {
                        var sheet = new Entity(SheetEntity)
                        {
                            ["enmax_acdndrawing"]     = new EntityReference(DrawingEntity, drawingId),
                            ["enmax_acdnstate"]       = new OptionSetValue(SheetStateAvailable),
                        };
                        if (createChildren) sheet["enmax_acdnsheetnumber"] = i;
                        if (owner != null) sheet["ownerid"] = owner;
                        CopyLookup(reservation, sheet, "enmax_acdnreservationtype");
                        CopyLookup(reservation, sheet, "enmax_acdndocumentsubtype");
                        service.Create(sheet);
                    }
                }
            }

            context.OutputParameters["DrawingsCreated"] = drawingsCreated;
        }

        /// <summary>
        /// Drawing/Drawing, Document/Form, and legacy reservations with no type/subtype
        /// set create numbered child items (-sss). Drawing/DrawingDocument and
        /// Document/Standard and Document/Procedure are base-only.
        /// </summary>
        private static bool CreatesChildItems(Entity reservation)
        {
            var type = reservation.GetAttributeValue<OptionSetValue>("enmax_acdnreservationtype")?.Value;
            var subtype = reservation.GetAttributeValue<OptionSetValue>("enmax_acdndocumentsubtype")?.Value;
            return TaxonomyConstants.CreatesChildItems(type, subtype);
        }

        /// <summary>
        /// Drawing/DrawingDocument, Standard, and Procedure get a singleton sheet carrier
        /// (no sheet number) for checkout/check-in; Drawing and Form use numbered children.
        /// </summary>
        private static bool IsBaseOnlyDocument(Entity reservation)
        {
            var type = reservation.GetAttributeValue<OptionSetValue>("enmax_acdnreservationtype")?.Value;
            var subtype = reservation.GetAttributeValue<OptionSetValue>("enmax_acdndocumentsubtype")?.Value;
            return TaxonomyConstants.IsBaseOnlyDocument(type, subtype);
        }

        private static void CopyLookup(Entity source, Entity target, string attribute)
        {
            if (source.Contains(attribute))
                target[attribute] = source[attribute];
        }
    }
}
