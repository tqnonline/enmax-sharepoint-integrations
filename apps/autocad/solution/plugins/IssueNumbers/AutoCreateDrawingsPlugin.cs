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
    ///   enmax_acdnsheetsperdrawing, ownerid, enmax_acdnbusiness, enmax_acdnasset,
    ///   enmax_acdnunit, enmax_acdndomain, enmax_acdnsystem, enmax_acdnkind
    /// </summary>
    public class AutoCreateDrawingsPlugin : PluginBase
    {
        private const string DrawingEntity     = "enmax_autocaddrawing";
        private const string SheetEntity       = "enmax_autocadsheet";
        private const string ReservationEntity = "enmax_autocadreservation";
        private const int    StatusApproved    = 2;
        private const int    StateAvailable    = 1;

        public AutoCreateDrawingsPlugin() : base(typeof(AutoCreateDrawingsPlugin)) { }

        public AutoCreateDrawingsPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(AutoCreateDrawingsPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.InitiatingUserService;
            var tracing = localPluginContext.TracingService;

            if (!context.PostEntityImages.Contains("postImage"))
            {
                tracing.Trace("AutoCreateDrawings: postImage not registered on step — skipping.");
                return;
            }

            var post = context.PostEntityImages["postImage"];

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
            int sheetCount = sheetsPer > 0 ? sheetsPer : 1;

            int created = 0;
            foreach (int number in numbers)
            {
                var drawing = new Entity(DrawingEntity)
                {
                    ["enmax_acdnnumber"]         = $"{sequenceKey}-{number:D4}",
                    ["enmax_acdnsequencenumber"] = number,
                    ["enmax_acdnstate"]          = new OptionSetValue(StateAvailable),
                    ["enmax_acdnreservation"]    = new EntityReference(ReservationEntity, context.PrimaryEntityId),
                };
                if (owner != null)                            drawing["ownerid"]          = owner;
                CopyLookup(post, drawing, "enmax_acdnbusiness");
                CopyLookup(post, drawing, "enmax_acdnasset");
                CopyLookup(post, drawing, "enmax_acdnunit");
                CopyLookup(post, drawing, "enmax_acdndomain");
                CopyLookup(post, drawing, "enmax_acdnsystem");
                CopyLookup(post, drawing, "enmax_acdnkind");

                Guid drawingId = service.Create(drawing);
                created++;

                for (int i = 1; i <= sheetCount; i++)
                {
                    var sheet = new Entity(SheetEntity)
                    {
                        ["enmax_acdndrawing"]     = new EntityReference(DrawingEntity, drawingId),
                        ["enmax_acdnsheetnumber"] = i,
                    };
                    if (owner != null) sheet["ownerid"] = owner;
                    service.Create(sheet);
                }
            }

            tracing.Trace($"AutoCreateDrawings: created {created} drawings × {sheetCount} sheet(s) each.");
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

        private static void CopyLookup(Entity source, Entity target, string attribute)
        {
            if (source.Contains(attribute))
                target[attribute] = source[attribute];
        }
    }
}
