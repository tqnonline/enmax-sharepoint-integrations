using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using System;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Fires automatically when enmax_acdnissuednumbers is written to an Approved reservation.
    /// Creates one Drawing + N Sheet records per issued number; owner = reservation owner.
    ///
    /// Registration: Post-Operation, Asynchronous, Update on enmax_autocadreservation
    /// Filtering attribute: enmax_acdnissuednumbers
    /// Post-image alias "postImage": enmax_acdnstatus, enmax_acdnissuednumbers,
    ///   enmax_acdnsheetsperdrawing, enmax_acdnreservationtype, enmax_acdndocumentsubtype,
    ///   ownerid, enmax_acdnbusiness, enmax_acdnasset, enmax_acdnunit, enmax_acdndomain,
    ///   enmax_acdnsystem, enmax_acdnkind, enmax_acdntargetdrawing
    /// </summary>
    public class AutoCreateDrawingsPlugin : PluginBase
    {
        private const string DrawingEntity      = "enmax_autocaddrawing";
        private const string SheetEntity        = "enmax_autocadsheet";
        private const string ReservationEntity  = "enmax_autocadreservation";
        private const string AuditEntity        = "enmax_autocadauditevent";
        private const int    StatusApproved     = 2;
        private const int    StateAvailable     = 1;
        private const int    AuditEventCreated  = 1;
        private const int    AuditSourceAction  = 4;
        private const int    SheetStateAvailable = 2;

        // Type-aware issuance (ADR 0001). Document/Standard is base-only; Drawing,
        // Document/Procedure, and legacy/null reservations all get child items.
        private const int    ReservationTypeDocument = 2;
        private const int    DocumentSubtypeStandard = 1;
        private const int    MaxChildItems           = 999;

        public AutoCreateDrawingsPlugin() : base(typeof(AutoCreateDrawingsPlugin)) { }

        public AutoCreateDrawingsPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(AutoCreateDrawingsPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;
            var actorId = localPluginContext.ActingUserId;
            var tracing = localPluginContext.TracingService;

            if (!context.PostEntityImages.Contains("postImage"))
            {
                tracing.Trace("AutoCreateDrawings: postImage not registered on step — skipping.");
                return;
            }

            var post = context.PostEntityImages["postImage"];

            var targetDrawing = GetTargetDrawing(service, post, context.PrimaryEntityId);
            if (targetDrawing != null)
            {
                tracing.Trace("AutoCreateDrawings: append reservation (target drawing set) — skipping.");
                return;
            }

            var status = post.GetAttributeValue<OptionSetValue>("enmax_acdnstatus");
            if (status?.Value != StatusApproved)
            {
                tracing.Trace($"AutoCreateDrawings: status={status?.Value}, not Approved — skipping.");
                return;
            }

            var issuedNumbersJson = post.GetAttributeValue<string>("enmax_acdnissuednumbers");
            if (string.IsNullOrWhiteSpace(issuedNumbersJson))
            {
                tracing.Trace("AutoCreateDrawings: enmax_acdnissuednumbers empty — skipping.");
                return;
            }

            int[] numbers;
            try { numbers = JsonConvert.DeserializeObject<int[]>(issuedNumbersJson); }
            catch (Exception ex)
            {
                tracing.Trace($"AutoCreateDrawings: invalid JSON in IssuedNumbers: {ex.Message}");
                return;
            }

            if (numbers == null || numbers.Length == 0)
            {
                tracing.Trace("AutoCreateDrawings: IssuedNumbers array empty — skipping.");
                return;
            }

            // Idempotency — skip if drawings already exist for this reservation
            var existingQ = new QueryExpression(DrawingEntity) { TopCount = 1, ColumnSet = new ColumnSet(false) };
            existingQ.Criteria.AddCondition("enmax_acdnreservation", ConditionOperator.Equal, context.PrimaryEntityId);
            if (service.RetrieveMultiple(existingQ).Entities.Count > 0)
            {
                tracing.Trace("AutoCreateDrawings: drawings already exist — skipping (idempotent).");
                return;
            }

            string sequenceKey = BuildSequenceKey(service, tracing, post);
            if (sequenceKey == null)
            {
                tracing.Trace("AutoCreateDrawings: could not build sequence key — composition field(s) missing.");
                return;
            }

            var owner      = post.GetAttributeValue<EntityReference>("ownerid");
            int sheetsPer  = post.Contains("enmax_acdnsheetsperdrawing")
                ? post.GetAttributeValue<int>("enmax_acdnsheetsperdrawing") : 0;
            int sheetCount = Math.Min(Math.Max(sheetsPer, 1), MaxChildItems);

            // Type-aware issuance (ADR 0001): Document/Standard is base-only. Type/Subtype
            // are carried on the post-image (missing -> null -> legacy Drawing behavior).
            bool createChildren = CreatesChildItems(post);
            bool createSingletonStandardSheet = IsStandardDocument(post);
            int issuedSheetCount = createChildren ? sheetCount : 1;

            int created = 0;
            foreach (int number in numbers)
            {
                var drawing = new Entity(DrawingEntity)
                {
                    ["enmax_acdnnumber"]         = $"{sequenceKey}-{number:D4}",
                    ["enmax_acdnsequencenumber"] = number,
                    ["enmax_acdnstate"]          = new OptionSetValue(StateAvailable),
                    ["enmax_acdnreservation"]    = new EntityReference(ReservationEntity, context.PrimaryEntityId),
                    ["enmax_acdnsheetcount"]     = issuedSheetCount,
                };
                if (owner != null)                            drawing["ownerid"]          = owner;
                CopyLookup(post, drawing, "enmax_acdnbusiness");
                CopyLookup(post, drawing, "enmax_acdnasset");
                CopyLookup(post, drawing, "enmax_acdnunit");
                CopyLookup(post, drawing, "enmax_acdndomain");
                CopyLookup(post, drawing, "enmax_acdnsystem");
                CopyLookup(post, drawing, "enmax_acdnkind");
                // Denormalize the taxonomy onto the record so a base item is
                // self-identifying without joining back to its reservation (ADR 0001).
                CopyLookup(post, drawing, "enmax_acdnreservationtype");
                CopyLookup(post, drawing, "enmax_acdndocumentsubtype");

                Guid drawingId = service.Create(drawing);
                created++;

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
                        CopyLookup(post, sheet, "enmax_acdnreservationtype");
                        CopyLookup(post, sheet, "enmax_acdndocumentsubtype");
                        service.Create(sheet);
                    }
                }

                service.Create(new Entity(AuditEntity)
                {
                    ["enmax_acdnevent"]        = new OptionSetValue(AuditEventCreated),
                    ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                    ["enmax_acdnsubjectid"]    = drawingId.ToString(),
                    ["enmax_acdnsubjecttable"] = DrawingEntity,
                    ["enmax_acdnactedby"]      = new EntityReference("systemuser", actorId),
                    ["enmax_acdnname"]         = $"Drawing {drawingId} created",
                });
            }

            tracing.Trace($"AutoCreateDrawings: created {created} drawings × {sheetCount} sheet(s) each.");
        }

        private static EntityReference GetTargetDrawing(
            IOrganizationService service, Entity post, Guid reservationId)
        {
            if (post.Contains("enmax_acdntargetdrawing"))
            {
                var fromPost = post.GetAttributeValue<EntityReference>("enmax_acdntargetdrawing");
                if (fromPost != null) return fromPost;
            }

            var reservation = service.Retrieve(
                ReservationEntity, reservationId, new ColumnSet("enmax_acdntargetdrawing"));
            return reservation.GetAttributeValue<EntityReference>("enmax_acdntargetdrawing");
        }

        private static string BuildSequenceKey(IOrganizationService service, ITracingService tracing, Entity post)
        {
            string GetCode(string field, string entityName)
            {
                var entityRef = post.GetAttributeValue<EntityReference>(field);
                if (entityRef == null) { tracing.Trace($"AutoCreateDrawings: {field} null"); return null; }
                var record = service.Retrieve(entityName, entityRef.Id, new ColumnSet("enmax_acdncode"));
                return record.GetAttributeValue<string>("enmax_acdncode")?.Trim().ToUpperInvariant();
            }

            string biz    = GetCode("enmax_acdnbusiness", "enmax_autocadbusiness");
            string asset  = GetCode("enmax_acdnasset",    "enmax_autocadasset");
            string unit   = GetCode("enmax_acdnunit",     "enmax_autocadunit");
            string domain = GetCode("enmax_acdndomain",   "enmax_autocaddomain");
            string system = GetCode("enmax_acdnsystem",   "enmax_autocadsystem");
            string kind   = GetCode("enmax_acdnkind",     "enmax_autocadkind");

            if (biz == null || asset == null || unit == null || domain == null || system == null || kind == null)
                return null;

            return $"{biz}-{asset}-{unit}-{domain}-{system}-{kind}";
        }

        /// <summary>
        /// Document/Standard reservations are base-only (a single Standard Document, no
        /// child items). Drawing, Document/Procedure, and legacy/null-type reservations
        /// all create child items — preserving the pre-taxonomy Drawing behavior.
        /// </summary>
        private static bool CreatesChildItems(Entity reservation)
        {
            var type    = reservation.GetAttributeValue<OptionSetValue>("enmax_acdnreservationtype")?.Value;
            var subtype = reservation.GetAttributeValue<OptionSetValue>("enmax_acdndocumentsubtype")?.Value;
            return !(type == ReservationTypeDocument && subtype == DocumentSubtypeStandard);
        }

        private static bool IsStandardDocument(Entity reservation)
        {
            var type = reservation.GetAttributeValue<OptionSetValue>("enmax_acdnreservationtype")?.Value;
            var subtype = reservation.GetAttributeValue<OptionSetValue>("enmax_acdndocumentsubtype")?.Value;
            return type == ReservationTypeDocument && subtype == DocumentSubtypeStandard;
        }

        private static void CopyLookup(Entity source, Entity target, string attribute)
        {
            if (source.Contains(attribute))
                target[attribute] = source[attribute];
        }
    }
}
