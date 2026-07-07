using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// WS5 SharePoint indexer upsert: matches discovered PDF files to a drawing or sheet
    /// record by deterministic filename, then idempotently writes link metadata.
    /// Custom API: enmax_acdnUpsertSharePointLinks (unbound; explicit Target input).
    /// </summary>
    public class UpsertSharePointLinksPlugin : PluginBase
    {
        private const string DrawingEntity = "enmax_autocaddrawing";
        private const string SheetEntity   = "enmax_autocadsheet";

        // Drawing columns
        private const string DrawingDropOffUrl       = "enmax_acdnsplibraryurl";
        private const string DrawingDestinationUrl   = "enmax_acdnspdestinationurl";
        private const string DrawingPresentDropOff   = "enmax_acdnpresentindropoff";
        private const string DrawingPresentDest      = "enmax_acdnpresentindestination";
        private const string DrawingLastIndexed      = "enmax_acdnlastindexedon";
        private const string DrawingNumber           = "enmax_acdnnumber";

        // Sheet columns (drop-off URL field name differs from drawing)
        private const string SheetDropOffUrl         = "enmax_acdnsharepointurl";
        private const string SheetDestinationUrl     = "enmax_acdnspdestinationurl";
        private const string SheetPresentDropOff     = "enmax_acdnpresentindropoff";
        private const string SheetPresentDest        = "enmax_acdnpresentindestination";
        private const string SheetLastIndexed        = "enmax_acdnlastindexedon";
        private const string SheetNumberCol          = "enmax_acdnsheetnumber";
        private const string SheetDrawing            = "enmax_acdndrawing";

        public UpsertSharePointLinksPlugin() : base(typeof(UpsertSharePointLinksPlugin)) { }

        public UpsertSharePointLinksPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(UpsertSharePointLinksPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;

            if (!context.InputParameters.Contains("Target"))
                throw new InvalidPluginExecutionException("Missing required input: Target");
            var target = context.InputParameters["Target"] as EntityReference;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");

            if (!context.InputParameters.Contains("RecordNumber"))
                throw new InvalidPluginExecutionException("Missing required input: RecordNumber");
            var recordNumber = context.InputParameters["RecordNumber"] as string;
            if (string.IsNullOrWhiteSpace(recordNumber))
                throw new InvalidPluginExecutionException("RecordNumber is required.");

            var foundFilesJson = context.InputParameters.Contains("FoundFiles")
                ? context.InputParameters["FoundFiles"] as string ?? "[]"
                : "[]";

            var entityKind = ResolveEntityKind(target.LogicalName);
            var expectedNumber = ResolveExpectedRecordNumber(service, target, entityKind);
            if (!string.Equals(expectedNumber.Trim(), recordNumber.Trim(), StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException(
                    $"RecordNumber '{recordNumber}' does not match the target record '{expectedNumber}'.");

            var foundFiles = ParseFoundFiles(foundFilesJson);
            var match = SharePointLinkMatcher.MatchFiles(recordNumber, foundFiles);
            var current = ReadCurrentState(service, target, entityKind);
            var decision = SharePointLinkMatcher.ComputeUpsert(current, match);

            if (decision.UpdateNeeded)
            {
                var update = new Entity(target.LogicalName, target.Id);
                ApplyState(update, entityKind, decision.NewState);
                update[entityKind == EntityKind.Drawing ? DrawingLastIndexed : SheetLastIndexed] =
                    DateTime.UtcNow;
                service.Update(update);
            }
            else
            {
                localPluginContext.Trace(
                    $"UpsertSharePointLinks: no change for {target.LogicalName}/{target.Id}");
            }

            context.OutputParameters["UpdateNeeded"]          = decision.UpdateNeeded;
            context.OutputParameters["DropOffUrl"]            = decision.NewState.DropOffUrl ?? string.Empty;
            context.OutputParameters["DestinationUrl"]        = decision.NewState.DestinationUrl ?? string.Empty;
            context.OutputParameters["PresentInDropOff"]      = decision.NewState.PresentInDropOff;
            context.OutputParameters["PresentInDestination"]  = decision.NewState.PresentInDestination;
        }

        private enum EntityKind { Drawing, Sheet }

        private static EntityKind ResolveEntityKind(string logicalName)
        {
            if (string.Equals(logicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                return EntityKind.Drawing;
            if (string.Equals(logicalName, SheetEntity, StringComparison.OrdinalIgnoreCase))
                return EntityKind.Sheet;
            throw new InvalidPluginExecutionException(
                $"Target must be {DrawingEntity} or {SheetEntity}, got {logicalName}.");
        }

        private static string ResolveExpectedRecordNumber(
            IOrganizationService service, EntityReference target, EntityKind kind)
        {
            if (kind == EntityKind.Drawing)
            {
                var drawing = service.Retrieve(DrawingEntity, target.Id, new ColumnSet(DrawingNumber));
                return drawing.GetAttributeValue<string>(DrawingNumber) ?? string.Empty;
            }

            var sheet = service.Retrieve(SheetEntity, target.Id,
                new ColumnSet(SheetNumberCol, SheetDrawing));
            var sheetNum = sheet.GetAttributeValue<int?>(SheetNumberCol) ?? 0;
            var drawingRef = sheet.GetAttributeValue<EntityReference>(SheetDrawing);
            if (drawingRef == null)
                throw new InvalidPluginExecutionException("Sheet has no parent drawing.");

            var parentDrawing = service.Retrieve(DrawingEntity, drawingRef.Id, new ColumnSet(DrawingNumber));
            var baseNumber = parentDrawing.GetAttributeValue<string>(DrawingNumber);
            if (string.IsNullOrWhiteSpace(baseNumber))
                throw new InvalidPluginExecutionException("Parent drawing has no number.");

            return $"{baseNumber}-{sheetNum:D3}";
        }

        public static IEnumerable<SharePointFoundFile> ParseFoundFiles(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return Enumerable.Empty<SharePointFoundFile>();

            JToken token;
            try
            {
                token = JToken.Parse(json);
            }
            catch (JsonException ex)
            {
                throw new InvalidPluginExecutionException($"FoundFiles is not valid JSON: {ex.Message}");
            }

            if (token.Type != JTokenType.Array)
                throw new InvalidPluginExecutionException("FoundFiles must be a JSON array.");

            var results = new List<SharePointFoundFile>();
            foreach (var item in token.Children())
            {
                if (item.Type != JTokenType.Object)
                    continue;

                var fileName = item["fileName"]?.ToString();
                if (string.IsNullOrWhiteSpace(fileName))
                    continue;

                var kindStr = item["libraryKind"]?.ToString() ?? "DropOff";
                if (!Enum.TryParse(kindStr, ignoreCase: true, out SharePointLibraryKind kind))
                    kind = SharePointLibraryKind.DropOff;

                results.Add(new SharePointFoundFile(
                    item["serverRelativeUrl"]?.ToString() ?? string.Empty,
                    item["absoluteUrl"]?.ToString() ?? string.Empty,
                    kind,
                    fileName));
            }

            return results;
        }

        private static SharePointLinkState ReadCurrentState(
            IOrganizationService service, EntityReference target, EntityKind kind)
        {
            if (kind == EntityKind.Drawing)
            {
                var row = service.Retrieve(DrawingEntity, target.Id, new ColumnSet(
                    DrawingDropOffUrl, DrawingDestinationUrl,
                    DrawingPresentDropOff, DrawingPresentDest));
                return new SharePointLinkState(
                    row.GetAttributeValue<string>(DrawingDropOffUrl),
                    row.GetAttributeValue<string>(DrawingDestinationUrl),
                    row.GetAttributeValue<bool?>(DrawingPresentDropOff) ?? false,
                    row.GetAttributeValue<bool?>(DrawingPresentDest) ?? false);
            }

            var sheet = service.Retrieve(SheetEntity, target.Id, new ColumnSet(
                SheetDropOffUrl, SheetDestinationUrl,
                SheetPresentDropOff, SheetPresentDest));
            return new SharePointLinkState(
                sheet.GetAttributeValue<string>(SheetDropOffUrl),
                sheet.GetAttributeValue<string>(SheetDestinationUrl),
                sheet.GetAttributeValue<bool?>(SheetPresentDropOff) ?? false,
                sheet.GetAttributeValue<bool?>(SheetPresentDest) ?? false);
        }

        private static void ApplyState(Entity update, EntityKind kind, SharePointLinkState state)
        {
            if (kind == EntityKind.Drawing)
            {
                update[DrawingDropOffUrl]     = state.DropOffUrl;
                update[DrawingDestinationUrl] = state.DestinationUrl;
                update[DrawingPresentDropOff] = state.PresentInDropOff;
                update[DrawingPresentDest]    = state.PresentInDestination;
                return;
            }

            update[SheetDropOffUrl]     = state.DropOffUrl;
            update[SheetDestinationUrl] = state.DestinationUrl;
            update[SheetPresentDropOff] = state.PresentInDropOff;
            update[SheetPresentDest]    = state.PresentInDestination;
        }
    }
}
