using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class UpsertSharePointLinksPluginTests
    {
        private const string DrawingEntity = "enmax_autocaddrawing";
        private const string SheetEntity   = "enmax_autocadsheet";
        private const string BaseNumber    = "GG-CG-00-ECS-AST-DD-0007";
        private const string ChildNumber   = "GG-CG-00-ECS-AST-DD-0007-001";

        private static string FoundFilesJson(params object[] files) =>
            JsonConvert.SerializeObject(files);

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid drawingId)
            BuildDrawingContext(string currentDropOff = null, bool presentDropOff = false)
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            ctx.Initialize(new List<Entity>
            {
                new Entity(DrawingEntity, drawingId)
                {
                    ["enmax_acdnnumber"]             = BaseNumber,
                    ["enmax_acdnsplibraryurl"]       = currentDropOff,
                    ["enmax_acdnpresentindropoff"]   = presentDropOff,
                    ["enmax_acdnpresentindestination"] = false,
                },
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);
            pluginCtx.InputParameters["RecordNumber"] = BaseNumber;
            pluginCtx.InputParameters["FoundFiles"] = "[]";

            return (ctx, pluginCtx, drawingId);
        }

        [Fact]
        public void Execute_DrawingNewDropOffFile_UpdatesRecord()
        {
            var (ctx, pluginCtx, drawingId) = BuildDrawingContext();
            pluginCtx.InputParameters["FoundFiles"] = FoundFilesJson(new
            {
                serverRelativeUrl = "/sites/Drawings/DropOff/" + BaseNumber + ".pdf",
                absoluteUrl       = "https://enmax.sharepoint.com/sites/Drawings/DropOff/" + BaseNumber + ".pdf",
                libraryKind       = "DropOff",
                fileName          = BaseNumber + ".pdf",
            });

            ctx.ExecutePluginWith<UpsertSharePointLinksPlugin>(pluginCtx);

            var updated = ctx.CreateQuery(DrawingEntity).First(e => e.Id == drawingId);
            updated.GetAttributeValue<string>("enmax_acdnsplibraryurl")
                .Should().Contain(BaseNumber + ".pdf");
            updated.GetAttributeValue<bool>("enmax_acdnpresentindropoff").Should().BeTrue();
            updated.GetAttributeValue<DateTime?>("enmax_acdnlastindexedon").Should().NotBeNull();
            pluginCtx.OutputParameters["UpdateNeeded"].Should().Be(true);
        }

        [Fact]
        public void Execute_IdenticalReRun_IsIdempotentNoUpdate()
        {
            var url = "https://enmax.sharepoint.com/sites/Drawings/DropOff/" + BaseNumber + ".pdf";
            var (ctx, pluginCtx, drawingId) = BuildDrawingContext(url, presentDropOff: true);
            pluginCtx.InputParameters["FoundFiles"] = FoundFilesJson(new
            {
                serverRelativeUrl = "/sites/Drawings/DropOff/" + BaseNumber + ".pdf",
                absoluteUrl       = url,
                libraryKind       = "DropOff",
                fileName          = BaseNumber + ".pdf",
            });

            ctx.ExecutePluginWith<UpsertSharePointLinksPlugin>(pluginCtx);

            pluginCtx.OutputParameters["UpdateNeeded"].Should().Be(false);
            var row = ctx.CreateQuery(DrawingEntity).First(e => e.Id == drawingId);
            row.GetAttributeValue<DateTime?>("enmax_acdnlastindexedon").Should().BeNull();
        }

        [Fact]
        public void Execute_FileRemoved_ClearsUrlAndFlag()
        {
            var url = "https://enmax.sharepoint.com/sites/Drawings/DropOff/" + BaseNumber + ".pdf";
            var (ctx, pluginCtx, drawingId) = BuildDrawingContext(url, presentDropOff: true);
            pluginCtx.InputParameters["FoundFiles"] = "[]";

            ctx.ExecutePluginWith<UpsertSharePointLinksPlugin>(pluginCtx);

            pluginCtx.OutputParameters["UpdateNeeded"].Should().Be(true);
            var row = ctx.CreateQuery(DrawingEntity).First(e => e.Id == drawingId);
            row.GetAttributeValue<string>("enmax_acdnsplibraryurl").Should().BeNull();
            row.GetAttributeValue<bool>("enmax_acdnpresentindropoff").Should().BeFalse();
        }

        [Fact]
        public void Execute_WrongRecordNumber_Throws()
        {
            var (ctx, pluginCtx, _) = BuildDrawingContext();
            pluginCtx.InputParameters["RecordNumber"] = "WRONG-NUMBER";

            Action act = () => ctx.ExecutePluginWith<UpsertSharePointLinksPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>()
                .WithMessage("*does not match*");
        }

        [Fact]
        public void Execute_SheetChildNumber_MatchesAndUpdates()
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var sheetId   = Guid.NewGuid();

            ctx.Initialize(new List<Entity>
            {
                new Entity(DrawingEntity, drawingId) { ["enmax_acdnnumber"] = BaseNumber },
                new Entity(SheetEntity, sheetId)
                {
                    ["enmax_acdndrawing"]     = new EntityReference(DrawingEntity, drawingId),
                    ["enmax_acdnsheetnumber"] = 1,
                },
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.InputParameters["Target"] = new EntityReference(SheetEntity, sheetId);
            pluginCtx.InputParameters["RecordNumber"] = ChildNumber;
            pluginCtx.InputParameters["FoundFiles"] = FoundFilesJson(new
            {
                serverRelativeUrl = "/sites/Drawings/DropOff/" + ChildNumber + ".pdf",
                absoluteUrl       = "https://enmax.sharepoint.com/sites/Drawings/DropOff/" + ChildNumber + ".pdf",
                libraryKind       = "DropOff",
                fileName          = ChildNumber + ".pdf",
            });

            ctx.ExecutePluginWith<UpsertSharePointLinksPlugin>(pluginCtx);

            var sheet = ctx.CreateQuery(SheetEntity).First(e => e.Id == sheetId);
            sheet.GetAttributeValue<string>("enmax_acdnsharepointurl").Should().Contain(ChildNumber);
            sheet.GetAttributeValue<bool>("enmax_acdnpresentindropoff").Should().BeTrue();
        }

        [Fact]
        public void ParseFoundFiles_InvalidJson_Throws()
        {
            Action act = () => UpsertSharePointLinksPlugin.ParseFoundFiles("{not-json");
            act.Should().Throw<InvalidPluginExecutionException>()
                .WithMessage("*valid JSON*");
        }
    }
}
