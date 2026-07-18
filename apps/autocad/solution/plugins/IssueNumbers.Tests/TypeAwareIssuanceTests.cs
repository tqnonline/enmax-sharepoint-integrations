using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Newtonsoft.Json;
using System;
using System.Linq;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Type-aware issuance (docs/drawing-document-subtype-CONTRACT.md): Drawing/DrawingDocument,
    /// Document/Standard, and Document/Procedure are base-only; Drawing/Drawing, Document/Form,
    /// and legacy/null-type reservations create child items. Child count is hard-capped at 999.
    /// Complements the golden tests, which pin the unchanged Drawing output contract.
    /// </summary>
    public class TypeAwareIssuanceTests
    {
        private const string ReservationEntity = "enmax_autocadreservation";
        private const string DrawingEntity     = "enmax_autocaddrawing";
        private const string SheetEntity       = "enmax_autocadsheet";

        private const int StatusApproved = 2;

        private const int TypeDrawing               = TaxonomyConstants.ReservationType.Drawing;
        private const int TypeDocument              = TaxonomyConstants.ReservationType.Document;
        private const int SubtypeDrawingDocument     = TaxonomyConstants.DocumentSubtype.DrawingDocument;
        private const int SubtypeDrawing             = TaxonomyConstants.DocumentSubtype.Drawing;
        private const int SubtypeStandard            = TaxonomyConstants.DocumentSubtype.Standard;
        private const int SubtypeProcedure           = TaxonomyConstants.DocumentSubtype.Procedure;
        private const int SubtypeForm                = TaxonomyConstants.DocumentSubtype.Form;

        private static readonly Guid ApproverTeamId = Guid.NewGuid();
        private static readonly Guid AdminTeamId    = Guid.NewGuid();

        // ── CreateDrawingsPlugin (custom API) ────────────────────────────────────

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx)
            BuildCreateDrawingsContext(int[] numbers, int? type, int? subtype, int sheetsPer,
                string sequenceKey = "GG-CG-00-ECS-AST-DD")
        {
            var ctx           = new XrmFakedContext();
            var reservationId = Guid.NewGuid();
            var ownerId       = Guid.NewGuid();

            var reservation = new Entity(ReservationEntity, reservationId)
            {
                ["ownerid"]                    = new EntityReference("systemuser", ownerId),
                ["enmax_acdnsheetsperdrawing"] = sheetsPer,
            };
            if (type.HasValue)    reservation["enmax_acdnreservationtype"] = new OptionSetValue(type.Value);
            if (subtype.HasValue) reservation["enmax_acdndocumentsubtype"] = new OptionSetValue(subtype.Value);

            ctx.Initialize(new[]
            {
                reservation,
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "AdminTeamId",
                    ["enmax_acdnvalue"] = AdminTeamId.ToString(),
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "ApproverTeamId",
                    ["enmax_acdnvalue"] = ApproverTeamId.ToString(),
                },
                new Entity("teammembership", Guid.NewGuid())
                {
                    ["teamid"]       = ApproverTeamId,
                    ["systemuserid"] = ownerId,
                },
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnCreateDrawings";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, ownerId);
            pluginCtx.InputParameters  = new ParameterCollection
            {
                ["Target"]        = new EntityReference(ReservationEntity, reservationId),
                ["IssuedNumbers"] = JsonConvert.SerializeObject(numbers),
                ["SequenceKey"]   = sequenceKey,
            };
            pluginCtx.OutputParameters = new ParameterCollection();

            return (ctx, pluginCtx);
        }

        private static int CountSheets(XrmFakedContext ctx) => ctx.CreateQuery(SheetEntity).Count();
        private static int CountDrawings(XrmFakedContext ctx) => ctx.CreateQuery(DrawingEntity).Count();

        [Fact]
        public void CreateDrawings_DrawingDocument_CreatesSingletonSheet()
        {
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(
                new[] { 1 }, TypeDrawing, SubtypeDrawingDocument, sheetsPer: 3);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1, because: "a Drawing Document is a single base record");
            CountSheets(ctx).Should().Be(1, because: "Drawing Document gets a singleton sheet carrier for checkout/check-in");
            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            drawing.GetAttributeValue<int>("enmax_acdnsheetcount").Should().Be(1);
            var sheet = ctx.CreateQuery(SheetEntity).Single();
            sheet.Contains("enmax_acdnsheetnumber").Should().BeFalse("singleton Drawing Document sheet stores no numeric suffix");
        }

        [Fact]
        public void CreateDrawings_DrawingSubtype_CreatesChildItems()
        {
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(
                new[] { 3 }, TypeDrawing, SubtypeDrawing, sheetsPer: 4);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1);
            CountSheets(ctx).Should().Be(4, because: "Drawing/Drawing (subtype 2) creates numbered child items");
        }

        [Fact]
        public void CreateDrawings_StandardDocument_CreatesSingletonSheet()
        {
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(
                new[] { 1 }, TypeDocument, SubtypeStandard, sheetsPer: 3);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1, because: "a Standard document is a single base record");
            CountSheets(ctx).Should().Be(1, because: "Standard now gets a singleton sheet carrier for checkout/check-in");
            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            drawing.GetAttributeValue<int>("enmax_acdnsheetcount").Should().Be(1);
            var sheet = ctx.CreateQuery(SheetEntity).Single();
            sheet.Contains("enmax_acdnsheetnumber").Should().BeFalse("singleton Standard sheet stores no numeric suffix");
        }

        [Fact]
        public void CreateDrawings_ProcedureDocument_CreatesSingletonSheet()
        {
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(
                new[] { 7 }, TypeDocument, SubtypeProcedure, sheetsPer: 2);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1);
            CountSheets(ctx).Should().Be(1, because: "Procedure is base-only like Standard");
            var sheet = ctx.CreateQuery(SheetEntity).Single();
            sheet.Contains("enmax_acdnsheetnumber").Should().BeFalse("singleton Procedure sheet stores no numeric suffix");
        }

        [Fact]
        public void CreateDrawings_FormDocument_CreatesChildItems()
        {
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(
                new[] { 7 }, TypeDocument, SubtypeForm, sheetsPer: 2);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1);
            CountSheets(ctx).Should().Be(2, because: "Form documents get one child Form per count");
        }

        [Fact]
        public void CreateDrawings_DrawingType_CreatesChildItems()
        {
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(
                new[] { 3 }, TypeDrawing, subtype: null, sheetsPer: 4);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1);
            CountSheets(ctx).Should().Be(4);
        }

        [Fact]
        public void CreateDrawings_LegacyNullType_CreatesChildItems()
        {
            // No reservationtype/subtype set — pre-taxonomy rows must keep Drawing behavior.
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(
                new[] { 5 }, type: null, subtype: null, sheetsPer: 2);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1);
            CountSheets(ctx).Should().Be(2, because: "null-type (legacy) reservations preserve Drawing child creation");
        }

        [Fact]
        public void CreateDrawings_ChildCount_HardCappedAt999()
        {
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(
                new[] { 9 }, TypeDrawing, subtype: null, sheetsPer: 1500);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            CountSheets(ctx).Should().Be(999, because: "child items are hard-capped at the 3-digit -sss ceiling");
        }

        // ── AutoCreateDrawingsPlugin (async, on approval) ────────────────────────

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx)
            BuildAutoCreateContext(int[] numbers, int? type, int? subtype, int sheetsPer)
        {
            var ctx           = new XrmFakedContext();
            var reservationId = Guid.NewGuid();
            var ownerId       = Guid.NewGuid();

            var bizId    = Guid.NewGuid();
            var assetId  = Guid.NewGuid();
            var unitId   = Guid.NewGuid();
            var domainId = Guid.NewGuid();
            var systemId = Guid.NewGuid();
            var kindId   = Guid.NewGuid();

            ctx.Initialize(new[]
            {
                new Entity(ReservationEntity, reservationId),
                new Entity("enmax_autocadbusiness", bizId)   { ["enmax_acdncode"] = "GG" },
                new Entity("enmax_autocadasset",    assetId) { ["enmax_acdncode"] = "CG" },
                new Entity("enmax_autocadunit",     unitId)  { ["enmax_acdncode"] = "00" },
                new Entity("enmax_autocaddomain",   domainId){ ["enmax_acdncode"] = "ECS" },
                new Entity("enmax_autocadsystem",   systemId){ ["enmax_acdncode"] = "AST" },
                new Entity("enmax_autocadkind",     kindId)  { ["enmax_acdncode"] = "DD" },
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName       = "Update";
            pluginCtx.Stage             = 40;
            pluginCtx.Mode              = 1;
            pluginCtx.PrimaryEntityId   = reservationId;
            pluginCtx.PrimaryEntityName = ReservationEntity;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, ownerId);
            pluginCtx.InputParameters   = new ParameterCollection();
            pluginCtx.OutputParameters  = new ParameterCollection();

            var post = new Entity(ReservationEntity, reservationId)
            {
                ["enmax_acdnstatus"]           = new OptionSetValue(StatusApproved),
                ["enmax_acdnissuednumbers"]    = JsonConvert.SerializeObject(numbers),
                ["enmax_acdnsheetsperdrawing"] = sheetsPer,
                ["ownerid"]                    = new EntityReference("systemuser", ownerId),
                ["enmax_acdnbusiness"]         = new EntityReference("enmax_autocadbusiness", bizId),
                ["enmax_acdnasset"]            = new EntityReference("enmax_autocadasset",    assetId),
                ["enmax_acdnunit"]             = new EntityReference("enmax_autocadunit",     unitId),
                ["enmax_acdndomain"]           = new EntityReference("enmax_autocaddomain",   domainId),
                ["enmax_acdnsystem"]           = new EntityReference("enmax_autocadsystem",   systemId),
                ["enmax_acdnkind"]             = new EntityReference("enmax_autocadkind",     kindId),
            };
            // Taxonomy travels on the post-image (see PluginDefinitions.psd1 postImage alias).
            if (type.HasValue)    post["enmax_acdnreservationtype"] = new OptionSetValue(type.Value);
            if (subtype.HasValue) post["enmax_acdndocumentsubtype"] = new OptionSetValue(subtype.Value);

            pluginCtx.PostEntityImages = new EntityImageCollection { ["postImage"] = post };

            return (ctx, pluginCtx);
        }

        [Fact]
        public void AutoCreate_DrawingDocument_CreatesSingletonSheet()
        {
            var (ctx, pluginCtx) = BuildAutoCreateContext(
                new[] { 1 }, TypeDrawing, SubtypeDrawingDocument, sheetsPer: 3);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1);
            CountSheets(ctx).Should().Be(1, because: "Drawing Document gets a singleton sheet carrier on async issuance too");
            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            drawing.GetAttributeValue<int>("enmax_acdnsheetcount").Should().Be(1);
            var sheet = ctx.CreateQuery(SheetEntity).Single();
            sheet.Contains("enmax_acdnsheetnumber").Should().BeFalse("singleton Drawing Document sheet stores no numeric suffix");
        }

        [Fact]
        public void AutoCreate_DrawingSubtype_CreatesChildItems()
        {
            var (ctx, pluginCtx) = BuildAutoCreateContext(
                new[] { 3 }, TypeDrawing, SubtypeDrawing, sheetsPer: 4);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1);
            CountSheets(ctx).Should().Be(4, because: "Drawing/Drawing (subtype 2) creates numbered child items");
        }

        [Fact]
        public void AutoCreate_StandardDocument_CreatesSingletonSheet()
        {
            var (ctx, pluginCtx) = BuildAutoCreateContext(
                new[] { 1 }, TypeDocument, SubtypeStandard, sheetsPer: 3);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1);
            CountSheets(ctx).Should().Be(1, because: "Standard now gets a singleton sheet carrier on async issuance too");
            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            drawing.GetAttributeValue<int>("enmax_acdnsheetcount").Should().Be(1);
            var sheet = ctx.CreateQuery(SheetEntity).Single();
            sheet.Contains("enmax_acdnsheetnumber").Should().BeFalse("singleton Standard sheet stores no numeric suffix");
        }

        [Fact]
        public void AutoCreate_ProcedureDocument_CreatesSingletonSheet()
        {
            var (ctx, pluginCtx) = BuildAutoCreateContext(
                new[] { 5 }, TypeDocument, SubtypeProcedure, sheetsPer: 2);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1);
            CountSheets(ctx).Should().Be(1, because: "Procedure is base-only like Standard");
            var sheet = ctx.CreateQuery(SheetEntity).Single();
            sheet.Contains("enmax_acdnsheetnumber").Should().BeFalse();
        }

        [Fact]
        public void AutoCreate_FormDocument_CreatesChildItems()
        {
            var (ctx, pluginCtx) = BuildAutoCreateContext(
                new[] { 5 }, TypeDocument, SubtypeForm, sheetsPer: 2);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            CountDrawings(ctx).Should().Be(1);
            CountSheets(ctx).Should().Be(2);
        }
    }
}
