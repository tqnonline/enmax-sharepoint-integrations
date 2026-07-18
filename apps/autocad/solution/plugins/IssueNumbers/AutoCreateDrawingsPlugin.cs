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

        // Type-aware issuance (ADR 0001, docs/drawing-document-subtype-CONTRACT.md).
        // Base-only (singleton sheet, no numbered -sss): Drawing/DrawingDocument or
        // Document/Standard or Document/Procedure. Numbered children: Drawing/Drawing,
        // Document/Form, or legacy reservations with no type/subtype set.
        private const int    MaxChildItems             = 999;

        public AutoCreateDrawingsPlugin() : base(typeof(AutoCreateDrawingsPlugin)) { }

        public AutoCreateDrawingsPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(AutoCreateDrawingsPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var tracing = localPluginContext.TracingService;

            // Async soft-fail policy: this step runs asynchronously off the reservation-approval
            // transaction, which has already committed by the time this executes. Faulting here
            // would only surface as a silent failed async job — log to enmax_autocadflowexception
            // and return instead of throwing, so the failure is visible to admins.
            try
            {
                ExecuteAutoCreateDrawings(localPluginContext);
            }
            catch (Exception ex)
            {
                tracing.Trace($"AutoCreateDrawings: unhandled exception — {ex.Message}");
                ExceptionEmitter.Log(
                    localPluginContext.SystemUserService,
                    tracing,
                    ex,
                    failedAction: $"{nameof(AutoCreateDrawingsPlugin)}.{nameof(ExecuteDataversePlugin)}",
                    subjectTable: context.PrimaryEntityName,
                    subjectId: context.PrimaryEntityId,
                    actingUserId: localPluginContext.ActingUserId,
                    correlationId: context.CorrelationId);
            }
        }

        private void ExecuteAutoCreateDrawings(ILocalPluginContext localPluginContext)
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

            // Async pipeline runs as SYSTEM — attribute Allocated to the approver (or
            // reservation owner when that is a user), not the platform identity.
            Guid auditActorId = ResolveAllocationActor(service, post, actorId);

            // Type-aware issuance (ADR 0001): Document/Standard and Document/Procedure are
            // base-only. Type/Subtype on the post-image (missing -> null -> Drawing).
            bool createChildren = CreatesChildItems(post);
            bool createSingletonStandardSheet = IsBaseOnlyDocument(post);
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
                        // No per-sheet Allocated audit — one Allocated on the parent drawing
                        // covers issuance for all child documents/forms (UI would otherwise
                        // show N identical "allocated" rows for one document).
                    }
                }

                service.Create(new Entity(AuditEntity)
                {
                    ["enmax_acdnevent"]        = new OptionSetValue(AuditEventCreated),
                    ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                    ["enmax_acdnsubjectid"]    = drawingId.ToString(),
                    ["enmax_acdnsubjecttable"] = DrawingEntity,
                    ["enmax_acdnactedby"]      = new EntityReference("systemuser", auditActorId),
                    ["enmax_acdntostate"]      = "Allocated",
                    ["enmax_acdnname"]         = $"Drawing {drawingId} allocated",
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

        /// <summary>
        /// Prefer the human approver, then a user owner, then the pipeline ActingUserId.
        /// Async AutoCreate runs as SYSTEM; without this, Allocated reads as "SYSTEM allocated…".
        /// </summary>
        private static Guid ResolveAllocationActor(
            IOrganizationService service, Entity post, Guid fallbackActorId)
        {
            Guid? UserId(EntityReference er)
            {
                if (er == null) return null;
                if (!string.Equals(er.LogicalName, "systemuser", StringComparison.OrdinalIgnoreCase))
                    return null;
                return er.Id != Guid.Empty ? er.Id : (Guid?)null;
            }

            Guid? approverId = UserId(post.GetAttributeValue<EntityReference>("enmax_acdnapprover"));
            Guid? ownerId = UserId(post.GetAttributeValue<EntityReference>("ownerid"));

            if (!approverId.HasValue || !ownerId.HasValue)
            {
                try
                {
                    var reservation = service.Retrieve(
                        ReservationEntity, post.Id, new ColumnSet("enmax_acdnapprover", "ownerid"));
                    if (!approverId.HasValue)
                        approverId = UserId(reservation.GetAttributeValue<EntityReference>("enmax_acdnapprover"));
                    if (!ownerId.HasValue)
                        ownerId = UserId(reservation.GetAttributeValue<EntityReference>("ownerid"));
                }
                catch
                {
                    // Fall through to ActingUserId.
                }
            }

            return approverId ?? ownerId ?? fallbackActorId;
        }

        private static void CopyLookup(Entity source, Entity target, string attribute)
        {
            if (source.Contains(attribute))
                target[attribute] = source[attribute];
        }
    }
}
