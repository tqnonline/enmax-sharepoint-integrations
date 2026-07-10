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

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Golden/characterization tests pinning the current Drawing numbering output contract
    /// before the type-aware refactor (ADR 0001). Any change here must be intentional.
    /// </summary>
    public class NumberingGoldenTests
    {
        private const string ReservationEntity = "enmax_autocadreservation";
        private const string DrawingEntity     = "enmax_autocaddrawing";
        private const string SheetEntity       = "enmax_autocadsheet";

        private const int StatusApproved = 2;

        private static readonly Guid ApproverTeamId = Guid.NewGuid();
        private static readonly Guid AdminTeamId     = Guid.NewGuid();

        /// <summary>
        /// Plugins persist drawing base number and sheet integer separately; consumers derive
        /// the full child number as base + "-" + 3-digit sheet suffix. Pin this derivation
        /// because ADR 0001 treats it as the child-number contract the refactor must preserve.
        /// </summary>
        private static string FormatChildNumber(string drawingNumber, int sheetNumber) =>
            $"{drawingNumber}-{sheetNumber:D3}";

        // ── CreateDrawingsPlugin helpers ─────────────────────────────────────────

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx)
            BuildCreateDrawingsContext(
                int[] numbers,
                string sequenceKey = "GG-CG-00-ECS-AST-DD",
                int sheetsPer = 1)
        {
            var ctx           = new XrmFakedContext();
            var reservationId = Guid.NewGuid();
            var ownerId       = Guid.NewGuid();
            var bizId         = Guid.NewGuid();

            ctx.Initialize(new[]
            {
                new Entity(ReservationEntity, reservationId)
                {
                    ["ownerid"]                    = new EntityReference("systemuser", ownerId),
                    ["enmax_acdnsheetsperdrawing"] = sheetsPer,
                    ["enmax_acdnbusiness"]         = new EntityReference("enmax_autocadbusiness", bizId),
                },
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

        // ── AutoCreateDrawingsPlugin helpers ─────────────────────────────────────

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx)
            BuildAutoCreateContext(int[] numbers, int sheetsPer = 1)
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

            pluginCtx.PostEntityImages = new EntityImageCollection { ["postImage"] = post };

            return (ctx, pluginCtx);
        }

        private static IReadOnlyList<(Entity drawing, IReadOnlyList<Entity> sheets)> GetDrawingsWithSheets(
            XrmFakedContext ctx)
        {
            var drawings = ctx.CreateQuery(DrawingEntity).ToList();
            var sheets   = ctx.CreateQuery(SheetEntity).ToList();

            return drawings
                .Select(d => (
                    d,
                    (IReadOnlyList<Entity>)sheets
                        .Where(s => s.GetAttributeValue<EntityReference>("enmax_acdndrawing")?.Id == d.Id)
                        .OrderBy(s => s.GetAttributeValue<int>("enmax_acdnsheetnumber"))
                        .ToList()))
                .OrderBy(t => t.d.GetAttributeValue<string>("enmax_acdnnumber"))
                .ToList();
        }

        // ── CreateDrawingsPlugin golden contract ─────────────────────────────────

        /// <summary>
        /// The refactor must preserve base drawing numbers as sequenceKey-NNNN with exactly
        /// four zero-padded digits and hyphen separators (CreateDrawingsPlugin path).
        /// </summary>
        [Fact]
        public void Golden_CreateDrawings_BaseNumberFormat_IsSequenceKeyHyphenFourDigitPaddedSequence()
        {
            const string sequenceKey = "GG-CG-00-ECS-AST-DD";
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(new[] { 1, 42 }, sequenceKey, sheetsPer: 1);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            var numbers = ctx.CreateQuery(DrawingEntity)
                .Select(e => e.GetAttributeValue<string>("enmax_acdnnumber"))
                .OrderBy(n => n)
                .ToList();

            numbers.Should().Equal(
                new[] { $"{sequenceKey}-0001", $"{sequenceKey}-0042" },
                because: "CreateDrawingsPlugin must format enmax_acdnnumber as {sequenceKey}-{nnnn:D4}");
        }

        /// <summary>
        /// Upper-bound sequence 9999 must still render as four digits, not overflow the format
        /// (CreateDrawingsPlugin path).
        /// </summary>
        [Fact]
        public void Golden_CreateDrawings_BaseNumberFormat_PadsSequence9999AtUpperBound()
        {
            const string sequenceKey = "GG-CG-00-ECS-AST-DD";
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(new[] { 9999 }, sequenceKey);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(DrawingEntity).Single()
                .GetAttributeValue<string>("enmax_acdnnumber")
                .Should().Be($"{sequenceKey}-9999",
                    because: "sequence 9999 is the plugin max and must remain 4-digit zero-padded");
        }

        /// <summary>
        /// Multi-child reservations must number sheets 1..N per drawing; the derived full child
        /// number uses a 3-digit sheet suffix appended to the base drawing number.
        /// </summary>
        [Fact]
        public void Golden_CreateDrawings_MultiChildReservation_DerivedChildNumbersUseThreeDigitSuffix()
        {
            const string sequenceKey = "GG-CG-00-ECS-AST-DD";
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(new[] { 7 }, sequenceKey, sheetsPer: 3);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            var (drawing, sheets) = GetDrawingsWithSheets(ctx).Single();
            var baseNumber = drawing.GetAttributeValue<string>("enmax_acdnnumber");

            baseNumber.Should().Be($"{sequenceKey}-0007");

            var sheetNumbers = sheets.Select(s => s.GetAttributeValue<int>("enmax_acdnsheetnumber")).ToList();
            sheetNumbers.Should().Equal(new[] { 1, 2, 3 },
                because: "sheet sequence must start at 1 and increment by 1 for each child");

            var derivedChildNumbers = sheets
                .Select(s => FormatChildNumber(baseNumber, s.GetAttributeValue<int>("enmax_acdnsheetnumber")))
                .ToList();

            derivedChildNumbers.Should().Equal(
                new[]
                {
                    $"{sequenceKey}-0007-001",
                    $"{sequenceKey}-0007-002",
                    $"{sequenceKey}-0007-003",
                },
                because: "full child number contract is base + '-' + 3-digit sheet suffix");
        }

        /// <summary>
        /// Two issued base numbers × multiple sheets must produce independent child suffix
        /// sequences starting at 001 for each drawing (CreateDrawingsPlugin path).
        /// </summary>
        [Fact]
        public void Golden_CreateDrawings_TwoDrawingsWithThreeSheetsEach_ChildSuffixResetsPerDrawing()
        {
            const string sequenceKey = "GG-CG-00-ECS-AST-DD";
            var (ctx, pluginCtx) = BuildCreateDrawingsContext(new[] { 10, 11 }, sequenceKey, sheetsPer: 3);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            var groups = GetDrawingsWithSheets(ctx);
            groups.Should().HaveCount(2);

            var firstChildNumbers = groups[0].sheets
                .Select(s => FormatChildNumber(
                    groups[0].drawing.GetAttributeValue<string>("enmax_acdnnumber"),
                    s.GetAttributeValue<int>("enmax_acdnsheetnumber")))
                .ToList();

            var secondChildNumbers = groups[1].sheets
                .Select(s => FormatChildNumber(
                    groups[1].drawing.GetAttributeValue<string>("enmax_acdnnumber"),
                    s.GetAttributeValue<int>("enmax_acdnsheetnumber")))
                .ToList();

            firstChildNumbers.Should().Equal(new[]
            {
                $"{sequenceKey}-0010-001",
                $"{sequenceKey}-0010-002",
                $"{sequenceKey}-0010-003",
            });

            secondChildNumbers.Should().Equal(
                new[]
                {
                    $"{sequenceKey}-0011-001",
                    $"{sequenceKey}-0011-002",
                    $"{sequenceKey}-0011-003",
                },
                because: "each drawing's child suffix sequence must restart at 001");
        }

        // ── AutoCreateDrawingsPlugin golden contract ─────────────────────────────

        /// <summary>
        /// AutoCreateDrawings must build the same base format from lookup codes (trimmed,
        /// uppercased) joined by hyphens, then append -NNNN with four-digit padding.
        /// </summary>
        [Fact]
        public void Golden_AutoCreateDrawings_BaseNumberFormat_MatchesCreateDrawingsFormat()
        {
            var (ctx, pluginCtx) = BuildAutoCreateContext(new[] { 1, 42 }, sheetsPer: 1);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            var numbers = ctx.CreateQuery(DrawingEntity)
                .Select(e => e.GetAttributeValue<string>("enmax_acdnnumber"))
                .OrderBy(n => n)
                .ToList();

            numbers.Should().Equal(
                new[] { "GG-CG-00-ECS-AST-DD-0001", "GG-CG-00-ECS-AST-DD-0042" },
                because: "AutoCreateDrawingsPlugin must use the same {sequenceKey}-{nnnn:D4} base format");
        }

        /// <summary>
        /// AutoCreateDrawings must honour the same multi-child sheet numbering contract as
        /// CreateDrawings when a reservation is approved asynchronously.
        /// </summary>
        [Fact]
        public void Golden_AutoCreateDrawings_MultiChildReservation_DerivedChildNumbersUseThreeDigitSuffix()
        {
            var (ctx, pluginCtx) = BuildAutoCreateContext(new[] { 5 }, sheetsPer: 2);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            var (drawing, sheets) = GetDrawingsWithSheets(ctx).Single();
            var baseNumber = drawing.GetAttributeValue<string>("enmax_acdnnumber");

            baseNumber.Should().Be("GG-CG-00-ECS-AST-DD-0005");

            sheets.Select(s => s.GetAttributeValue<int>("enmax_acdnsheetnumber"))
                .Should().Equal(new[] { 1, 2 });

            sheets.Select(s => FormatChildNumber(baseNumber, s.GetAttributeValue<int>("enmax_acdnsheetnumber")))
                .Should().Equal(new[]
                {
                    "GG-CG-00-ECS-AST-DD-0005-001",
                    "GG-CG-00-ECS-AST-DD-0005-002",
                });
        }
    }
}
