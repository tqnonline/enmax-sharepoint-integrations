using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Text.RegularExpressions;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// WS5 SharePoint indexer: creates (or ensures) a Pending SharePoint Import stub for a
    /// PDF discovered in a destination library with no matching Dataverse record.
    /// Custom API: enmax_acdnCreateSharePointImportStub (unbound).
    ///
    /// Always ensures the PARENT enmax_autocaddrawing exists first (Drawing/Standard/Procedure/
    /// Form taxonomy). Drawing/Form filenames carrying a -ddd sheet suffix additionally
    /// find-or-create the enmax_autocadsheet child and place the destination link there;
    /// Standard/Procedure (base-only, ADR 0001) and non-suffixed Drawing/Form filenames place
    /// the destination link on the parent itself.
    ///
    /// Idempotent on FileUrl: re-running the indexer against an unchanged file is a no-op that
    /// returns the previously created ids (Created=false). This is a system/indexer operation —
    /// no ActingUserId/authorization gate, matching enmax_acdnUpsertSharePointLinks.
    /// </summary>
    public class CreateSharePointImportStubPlugin : PluginBase
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string SheetEntity     = "enmax_autocadsheet";

        private const string ColNumber               = "enmax_acdnnumber";
        private const string ColDrawingState          = "enmax_acdnstate";
        private const string ColReservationType       = "enmax_acdnreservationtype";
        private const string ColDocumentSubtype       = "enmax_acdndocumentsubtype";
        private const string ColSpImportSourceUrl     = "enmax_acdnspimportsourceurl";
        private const string ColSpImportMetadata      = "enmax_acdnspimportmetadata";
        private const string ColDestinationUrl        = "enmax_acdnspdestinationurl";
        private const string ColPresentInDestination  = "enmax_acdnpresentindestination";

        private const string ColSheetDrawing               = "enmax_acdndrawing";
        private const string ColSheetNumber                = "enmax_acdnsheetnumber";
        private const string ColSheetState                 = "enmax_acdnstate";
        private const string ColSheetDestinationUrl        = "enmax_acdnspdestinationurl";
        private const string ColSheetPresentInDestination  = "enmax_acdnpresentindestination";
        private const string ColSheetReservationType        = "enmax_acdnreservationtype";
        private const string ColSheetDocumentSubtype         = "enmax_acdndocumentsubtype";

        private const int StatePendingSharePointImport = 8;
        private const int SheetStateAvailable          = 2;

        private const int ReservationTypeDrawing  = 1;
        private const int ReservationTypeDocument = 2;
        private const int DocumentSubtypeStandard  = 1;
        private const int DocumentSubtypeProcedure = 2;
        private const int DocumentSubtypeForm      = 3;

        private const string PdfExtension = ".pdf";

        // A child (sheet) filename is the parent number, a literal dash, then exactly three
        // digits (Rule: -sss ceiling of 999 items — see AddChildItemsPlugin). The parent number
        // itself always ends in a 4-digit sequence (AutoCreateDrawingsPlugin: "{seq}-{D4}"), so
        // this never misfires against the parent's own trailing digits.
        private static readonly Regex ChildSuffixPattern =
            new Regex(@"^(?<parent>.+)-(?<sheet>\d{3})$", RegexOptions.Compiled);

        public CreateSharePointImportStubPlugin() : base(typeof(CreateSharePointImportStubPlugin)) { }

        public CreateSharePointImportStubPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(CreateSharePointImportStubPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;

            string fileName     = GetRequiredString(context, "FileName");
            string fileUrl      = GetRequiredString(context, "FileUrl");
            string taxonomyRaw  = GetRequiredString(context, "Taxonomy");
            string metadataJson = GetOptionalString(context, "MetadataJson");
            string recordTypeSp = GetOptionalString(context, "RecordTypeSp");

            var taxonomy = ParseTaxonomy(taxonomyRaw);
            string recordNumber = DeriveRecordNumber(fileName);

            int reservationType    = ResolveReservationType(taxonomy);
            int? documentSubtype   = ResolveDocumentSubtype(taxonomy);
            bool takesChildren     = taxonomy == Taxonomy.Drawing || taxonomy == Taxonomy.Form;

            string parentNumber = recordNumber;
            int? sheetNumber = null;
            if (takesChildren)
            {
                var match = ChildSuffixPattern.Match(recordNumber);
                if (match.Success)
                {
                    parentNumber = match.Groups["parent"].Value;
                    sheetNumber  = int.Parse(match.Groups["sheet"].Value);
                }
            }

            string mergedMetadata = MergeMetadata(metadataJson, recordTypeSp);

            // Idempotency: the same source file was already imported for this record.
            var existingDrawing = FindDrawingBySourceUrl(service, fileUrl);
            if (existingDrawing != null)
            {
                if (mergedMetadata != null)
                    service.Update(new Entity(DrawingEntity, existingDrawing.Id)
                    {
                        [ColSpImportMetadata] = mergedMetadata,
                    });

                Guid? existingSheetId = sheetNumber.HasValue
                    ? FindSheetByDrawingAndNumber(service, existingDrawing.Id, sheetNumber.Value)?.Id
                    : (Guid?)null;

                SetOutputs(context, existingDrawing.Id, existingSheetId, recordNumber, created: false);
                return;
            }

            var parentDrawing = FindDrawingByNumber(service, parentNumber);
            Guid drawingId;
            bool drawingCreated;
            if (parentDrawing != null)
            {
                drawingId = parentDrawing.Id;
                drawingCreated = false;
                var drawingUpdate = new Entity(DrawingEntity, drawingId) { [ColSpImportSourceUrl] = fileUrl };
                if (mergedMetadata != null) drawingUpdate[ColSpImportMetadata] = mergedMetadata;
                service.Update(drawingUpdate);
            }
            else
            {
                var newDrawing = new Entity(DrawingEntity)
                {
                    [ColNumber]            = parentNumber,
                    [ColDrawingState]      = new OptionSetValue(StatePendingSharePointImport),
                    [ColReservationType]   = new OptionSetValue(reservationType),
                    [ColSpImportSourceUrl] = fileUrl,
                };
                if (documentSubtype.HasValue) newDrawing[ColDocumentSubtype] = new OptionSetValue(documentSubtype.Value);
                if (mergedMetadata != null)   newDrawing[ColSpImportMetadata] = mergedMetadata;
                drawingId = service.Create(newDrawing);
                drawingCreated = true;
            }

            Guid? sheetId = null;
            bool sheetCreated = false;
            if (sheetNumber.HasValue)
            {
                var existingSheet = FindSheetByDrawingAndNumber(service, drawingId, sheetNumber.Value);
                if (existingSheet != null)
                {
                    sheetId = existingSheet.Id;
                    service.Update(new Entity(SheetEntity, sheetId.Value)
                    {
                        [ColSheetDestinationUrl]       = fileUrl,
                        [ColSheetPresentInDestination] = true,
                    });
                }
                else
                {
                    var sheet = new Entity(SheetEntity)
                    {
                        [ColSheetDrawing]               = new EntityReference(DrawingEntity, drawingId),
                        [ColSheetNumber]                = sheetNumber.Value,
                        [ColSheetState]                 = new OptionSetValue(SheetStateAvailable),
                        [ColSheetDestinationUrl]        = fileUrl,
                        [ColSheetPresentInDestination]  = true,
                        [ColSheetReservationType]       = new OptionSetValue(reservationType),
                    };
                    if (documentSubtype.HasValue) sheet[ColSheetDocumentSubtype] = new OptionSetValue(documentSubtype.Value);
                    sheetId = service.Create(sheet);
                    sheetCreated = true;
                }
            }
            else
            {
                // Standard/Procedure (base-only) and non-suffixed Drawing/Form numbers carry
                // the destination link on the parent record itself.
                service.Update(new Entity(DrawingEntity, drawingId)
                {
                    [ColDestinationUrl]       = fileUrl,
                    [ColPresentInDestination] = true,
                });
            }

            SetOutputs(context, drawingId, sheetId, recordNumber, created: drawingCreated || sheetCreated);
        }

        private enum Taxonomy { Drawing, Standard, Procedure, Form }

        private static Taxonomy ParseTaxonomy(string raw)
        {
            switch (raw.Trim().ToLowerInvariant())
            {
                case "drawing":   return Taxonomy.Drawing;
                case "standard":  return Taxonomy.Standard;
                case "procedure": return Taxonomy.Procedure;
                case "form":      return Taxonomy.Form;
                default:
                    throw new InvalidPluginExecutionException(
                        $"Taxonomy must be one of Drawing, Standard, Procedure, Form; got '{raw}'.");
            }
        }

        private static int ResolveReservationType(Taxonomy taxonomy)
            => taxonomy == Taxonomy.Drawing ? ReservationTypeDrawing : ReservationTypeDocument;

        private static int? ResolveDocumentSubtype(Taxonomy taxonomy)
        {
            switch (taxonomy)
            {
                case Taxonomy.Standard:  return DocumentSubtypeStandard;
                case Taxonomy.Procedure: return DocumentSubtypeProcedure;
                case Taxonomy.Form:      return DocumentSubtypeForm;
                default:                 return null;
            }
        }

        /// <summary>Strips a single trailing .pdf extension (case-insensitive). Throws otherwise.</summary>
        private static string DeriveRecordNumber(string fileName)
        {
            var trimmed = fileName.Trim();
            if (!trimmed.EndsWith(PdfExtension, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"FileName must end with .pdf; got '{fileName}'.");

            var stripped = trimmed.Substring(0, trimmed.Length - PdfExtension.Length).Trim();
            if (stripped.Length == 0)
                throw new InvalidPluginExecutionException("FileName must contain a record number before .pdf.");

            return stripped;
        }

        private static string MergeMetadata(string metadataJson, string recordTypeSp)
        {
            if (string.IsNullOrWhiteSpace(metadataJson) && string.IsNullOrWhiteSpace(recordTypeSp))
                return null;

            JObject obj;
            if (!string.IsNullOrWhiteSpace(metadataJson))
            {
                try { obj = JObject.Parse(metadataJson); }
                catch (JsonException ex)
                {
                    throw new InvalidPluginExecutionException($"MetadataJson is not valid JSON: {ex.Message}", ex);
                }
            }
            else
            {
                obj = new JObject();
            }

            if (!string.IsNullOrWhiteSpace(recordTypeSp))
                obj["recordTypeSp"] = recordTypeSp;

            return obj.ToString(Formatting.None);
        }

        private static Entity FindDrawingBySourceUrl(IOrganizationService service, string fileUrl)
        {
            var q = new QueryExpression(DrawingEntity)
            {
                ColumnSet = new ColumnSet(true),
                TopCount  = 1,
            };
            q.Criteria.AddCondition(ColSpImportSourceUrl, ConditionOperator.Equal, fileUrl);
            var r = service.RetrieveMultiple(q);
            return r.Entities.Count > 0 ? r.Entities[0] : null;
        }

        private static Entity FindDrawingByNumber(IOrganizationService service, string number)
        {
            var q = new QueryExpression(DrawingEntity)
            {
                ColumnSet = new ColumnSet(true),
                TopCount  = 1,
            };
            q.Criteria.AddCondition(ColNumber, ConditionOperator.Equal, number);
            var r = service.RetrieveMultiple(q);
            return r.Entities.Count > 0 ? r.Entities[0] : null;
        }

        private static Entity FindSheetByDrawingAndNumber(IOrganizationService service, Guid drawingId, int sheetNumber)
        {
            var q = new QueryExpression(SheetEntity)
            {
                ColumnSet = new ColumnSet(false),
                TopCount  = 1,
            };
            q.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, drawingId);
            q.Criteria.AddCondition(ColSheetNumber, ConditionOperator.Equal, sheetNumber);
            var r = service.RetrieveMultiple(q);
            return r.Entities.Count > 0 ? r.Entities[0] : null;
        }

        private static void SetOutputs(
            IPluginExecutionContext context, Guid drawingId, Guid? sheetId, string recordNumber, bool created)
        {
            context.OutputParameters["DrawingId"]    = drawingId.ToString();
            context.OutputParameters["SheetId"]      = sheetId.HasValue ? sheetId.Value.ToString() : string.Empty;
            context.OutputParameters["RecordNumber"] = recordNumber;
            context.OutputParameters["Created"]      = created;
        }

        private static string GetRequiredString(IPluginExecutionContext context, string name)
        {
            var value = context.InputParameters.Contains(name) ? context.InputParameters[name] as string : null;
            if (string.IsNullOrWhiteSpace(value))
                throw new InvalidPluginExecutionException($"Missing required input: {name}");
            return value;
        }

        private static string GetOptionalString(IPluginExecutionContext context, string name)
        {
            if (!context.InputParameters.Contains(name)) return null;
            var value = context.InputParameters[name] as string;
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }
    }
}
