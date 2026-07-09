using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Standard Document reservation semantics (ADR 0001 + ADR 0002 amendment):
    /// - NEW range: K sequential bases, each with one singleton sheet (no -sss).
    /// - ADD-TO-EXISTING: continues the shared per-coding sequence (no targetDrawing).
    /// AddChildItems base-only guard lives in <see cref="AddChildItemsPluginTests"/>.
    /// MaxRecordsPerReservation is enforced in the frontend wizard; plugins do not cap count.
    /// </summary>
    public class StandardReservationTests
    {
        private const string ReservationEntity = "enmax_autocadreservation";
        private const string DrawingEntity     = "enmax_autocaddrawing";
        private const string SheetEntity       = "enmax_autocadsheet";
        private const string SequenceEntity    = "enmax_autocadnumbersequence";

        private const int TypeDocument     = 2;
        private const int SubtypeStandard  = 1;
        private const int SheetStateAvailable = 2;

        private const string SequenceKey = "GG-CG-00-ECS-AST-DD";

        private static readonly Guid ApproverTeamId = Guid.NewGuid();
        private static readonly Guid AdminTeamId    = Guid.NewGuid();

        // ── CreateDrawings helpers ───────────────────────────────────────────────

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid reservationId)
            BuildCreateDrawingsContext(int[] numbers, int sheetsPer = 3)
        {
            var ctx           = new XrmFakedContext();
            var reservationId = Guid.NewGuid();
            var ownerId       = Guid.NewGuid();

            ctx.Initialize(new[]
            {
                new Entity(ReservationEntity, reservationId)
                {
                    ["ownerid"]                    = new EntityReference("systemuser", ownerId),
                    ["enmax_acdnsheetsperdrawing"] = sheetsPer,
                    ["enmax_acdnreservationtype"]  = new OptionSetValue(TypeDocument),
                    ["enmax_acdndocumentsubtype"]  = new OptionSetValue(SubtypeStandard),
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
            pluginCtx.InitiatingUserId = ownerId;
            pluginCtx.InputParameters  = new ParameterCollection
            {
                ["Target"]        = new EntityReference(ReservationEntity, reservationId),
                ["IssuedNumbers"] = JsonConvert.SerializeObject(numbers),
                ["SequenceKey"]   = SequenceKey,
            };
            pluginCtx.OutputParameters = new ParameterCollection();

            return (ctx, pluginCtx, reservationId);
        }

        // ── IssueNumbers helpers (add-to-existing path) ──────────────────────────

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid reservationId)
            BuildIssueNumbersContext(int count, int lastIssued)
        {
            var ctx           = new XrmFakedContext();
            var reservationId = Guid.NewGuid();
            var ownerId       = PluginContextFactory.AuthorizedUserId;

            var bizId    = Guid.NewGuid();
            var assetId  = Guid.NewGuid();
            var unitId   = Guid.NewGuid();
            var domainId = Guid.NewGuid();
            var systemId = Guid.NewGuid();
            var kindId   = Guid.NewGuid();

            var seed = new List<Entity>
            {
                PluginContextFactory.BuildSequenceRow(key: SequenceKey, lastIssued: lastIssued),
                new Entity("enmax_autocadbusiness", bizId)   { ["enmax_acdncode"] = "GG" },
                new Entity("enmax_autocadasset",    assetId) { ["enmax_acdncode"] = "CG" },
                new Entity("enmax_autocadunit",     unitId)  { ["enmax_acdncode"] = "00" },
                new Entity("enmax_autocaddomain",   domainId){ ["enmax_acdncode"] = "ECS" },
                new Entity("enmax_autocadsystem",   systemId){ ["enmax_acdncode"] = "AST" },
                new Entity("enmax_autocadkind",     kindId)  { ["enmax_acdncode"] = "DD" },
                new Entity(ReservationEntity, reservationId)
                {
                    ["enmax_acdndrawingcount"]     = count,
                    ["enmax_acdnreservationtype"]  = new OptionSetValue(TypeDocument),
                    ["enmax_acdndocumentsubtype"]  = new OptionSetValue(SubtypeStandard),
                    ["enmax_acdnbusiness"]         = new EntityReference("enmax_autocadbusiness", bizId),
                    ["enmax_acdnasset"]            = new EntityReference("enmax_autocadasset",    assetId),
                    ["enmax_acdnunit"]             = new EntityReference("enmax_autocadunit",     unitId),
                    ["enmax_acdndomain"]           = new EntityReference("enmax_autocaddomain",   domainId),
                    ["enmax_acdnsystem"]           = new EntityReference("enmax_autocadsystem",   systemId),
                    ["enmax_acdnkind"]             = new EntityReference("enmax_autocadkind",     kindId),
                },
            };

            ctx.Initialize(seed);
            PluginContextFactory.SeedAuthForUser(ctx, ownerId);

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnIssueNumbers";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = ownerId;
            pluginCtx.InputParameters  = new ParameterCollection
            {
                ["Reservation"] = new EntityReference(ReservationEntity, reservationId),
            };
            pluginCtx.OutputParameters = new ParameterCollection();

            return (ctx, pluginCtx, reservationId);
        }

        private static List<Entity> Drawings(XrmFakedContext ctx) =>
            ctx.CreateQuery(DrawingEntity).OrderBy(d => d.GetAttributeValue<int>("enmax_acdnsequencenumber")).ToList();

        private static List<Entity> Sheets(XrmFakedContext ctx) =>
            ctx.CreateQuery(SheetEntity).ToList();

        // ── NEW range ────────────────────────────────────────────────────────────

        [Theory]
        [InlineData(1)]
        [InlineData(3)]
        [InlineData(5)]
        public void Standard_NewRange_IssuesKSequentialBases_EachWithSingletonSheet(int k)
        {
            var numbers = Enumerable.Range(1, k).ToArray();
            var (ctx, pluginCtx, _) = BuildCreateDrawingsContext(numbers, sheetsPer: 99);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            var drawings = Drawings(ctx);
            drawings.Should().HaveCount(k, because: "a Standard NEW range issues one base per issued number");
            drawings.Select(d => d.GetAttributeValue<int>("enmax_acdnsheetcount"))
                .Should().OnlyContain(c => c == 1, because: "each Standard base carries exactly one singleton sheet");

            var sheets = Sheets(ctx);
            sheets.Should().HaveCount(k, because: "one singleton sheet per base, never -sss children");
            foreach (var s in sheets)
            {
                s.Contains("enmax_acdnsheetnumber").Should().BeFalse();
                s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value
                    .Should().Be(SheetStateAvailable, because: "singleton sheets start Available");
            }

            drawings.Select(d => d.GetAttributeValue<string>("enmax_acdnnumber"))
                .Should().Equal(numbers.Select(n => $"{SequenceKey}-{n:D4}"));
        }

        // ── ADD-TO-EXISTING (sequence continuation) ──────────────────────────────

        [Fact]
        public void Standard_AddToExisting_ContinuesSequence_NoTargetDrawing_NoSssChildren()
        {
            const int yyyy = 7;
            const int k    = 2;
            var (ctx, issueCtx, reservationId) = BuildIssueNumbersContext(count: k, lastIssued: yyyy);

            ctx.ExecutePluginWith<IssueNumbersPlugin>(issueCtx);

            var issued = JsonConvert.DeserializeObject<int[]>((string)issueCtx.OutputParameters["IssuedNumbers"]);
            issued.Should().Equal(new[] { yyyy + 1, yyyy + k },
                because: "add-to-existing continues the shared per-coding sequence from YYYY+1");

            var reservation = ctx.GetFakedOrganizationService()
                .Retrieve(ReservationEntity, reservationId, new Microsoft.Xrm.Sdk.Query.ColumnSet(true));
            reservation.Contains("enmax_acdntargetdrawing").Should().BeFalse(
                because: "Standard add-to-existing never binds a target drawing");

            // Materialize bases + singleton sheets (approval path uses AutoCreateDrawings; pin via CreateDrawings).
            var ownerId = PluginContextFactory.AuthorizedUserId;
            reservation["ownerid"] = new EntityReference("systemuser", ownerId);
            var createCtx = ctx.GetDefaultPluginContext();
            createCtx.MessageName      = "enmax_acdnCreateDrawings";
            createCtx.Stage            = 40;
            createCtx.InitiatingUserId = ownerId;
            createCtx.InputParameters  = new ParameterCollection
            {
                ["Target"]        = new EntityReference(ReservationEntity, reservationId),
                ["IssuedNumbers"] = JsonConvert.SerializeObject(issued),
                ["SequenceKey"]   = SequenceKey,
            };
            createCtx.OutputParameters = new ParameterCollection();
            ctx.ExecutePluginWith<CreateDrawingsPlugin>(createCtx);

            Drawings(ctx).Should().HaveCount(k);
            Sheets(ctx).Should().HaveCount(k);
            Sheets(ctx).Should().OnlyContain(s => !s.Contains("enmax_acdnsheetnumber"));
        }

        [Fact]
        public void Standard_SequenceContinuity_NewThenAddToExisting_ProducesUnbrokenRun()
        {
            var fxCtx = new XrmFakedContext();
            var row   = PluginContextFactory.BuildSequenceRow(key: SequenceKey, lastIssued: 0);
            fxCtx.Initialize(new List<Entity> { row });

            // NEW range: count=3 → [1,2,3]
            var newCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 3);
            fxCtx.ExecutePluginWith<IssueNumbersPlugin>(newCtx);
            var first = JsonConvert.DeserializeObject<int[]>((string)newCtx.OutputParameters["IssuedNumbers"]);
            first.Should().Equal(1, 2, 3);

            // ADD-TO-EXISTING: count=2 → [4,5] (sequence now at 5)
            var addCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 2);
            fxCtx.ExecutePluginWith<IssueNumbersPlugin>(addCtx);
            var second = JsonConvert.DeserializeObject<int[]>((string)addCtx.OutputParameters["IssuedNumbers"]);
            second.Should().Equal(4, 5);

            var sequence = fxCtx.CreateQuery(SequenceEntity).Single();
            sequence.GetAttributeValue<int>("enmax_acdnlastissued").Should().Be(5,
                because: "New then add-to-existing in the same coding must advance one shared counter");
        }
    }
}
