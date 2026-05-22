using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using System;
using System.Linq;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class CreateDrawingsPluginTests
    {
        private const string ReservationEntity = "enmax_autocadreservation";
        private const string DrawingEntity     = "enmax_autocaddrawing";
        private const string SheetEntity       = "enmax_autocadsheet";

        // ── Helpers ──────────────────────────────────────────────────────────────

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid reservationId, Guid ownerId)
            BuildContext(int[] numbers, string sequenceKey = "BIZ-AST-UNT-DOM-SYS-KND", int sheetsPer = 2)
        {
            var ctx           = new XrmFakedContext();
            var reservationId = Guid.NewGuid();
            var ownerId       = Guid.NewGuid();
            var bizId         = Guid.NewGuid();

            var reservation = new Entity(ReservationEntity, reservationId)
            {
                ["ownerid"]                    = new EntityReference("systemuser", ownerId),
                ["enmax_acdnsheetsperdrawing"] = sheetsPer,
                ["enmax_acdnbusiness"]         = new EntityReference("enmax_autocadbusiness", bizId),
            };
            ctx.Initialize(new[] { reservation });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnCreateDrawings";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = ownerId;
            pluginCtx.InputParameters  = new ParameterCollection
            {
                ["Target"]        = new EntityReference(ReservationEntity, reservationId),
                ["IssuedNumbers"] = JsonConvert.SerializeObject(numbers),
                ["SequenceKey"]   = sequenceKey,
            };
            pluginCtx.OutputParameters = new ParameterCollection();

            return (ctx, pluginCtx, reservationId, ownerId);
        }

        // ── Happy path ───────────────────────────────────────────────────────────

        [Fact]
        public void Execute_CreatesOneDrawingPerIssuedNumber()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1, 2, 3 });

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(DrawingEntity).ToList().Should().HaveCount(3);
        }

        [Fact]
        public void Execute_DrawingNumbers_UseSequenceKeyAndPaddedNumber()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1, 42 }, "ENM-SUB-NE-ELE-DIS-DRW");

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            var numbers = ctx.CreateQuery(DrawingEntity)
                .Select(e => e.GetAttributeValue<string>("enmax_acdnnumber"))
                .OrderBy(n => n)
                .ToList();

            numbers.Should().Equal("ENM-SUB-NE-ELE-DIS-DRW-0001", "ENM-SUB-NE-ELE-DIS-DRW-0042");
        }

        [Fact]
        public void Execute_DrawingState_IsAvailable()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 5 });

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            drawing.GetAttributeValue<OptionSetValue>("enmax_acdnstate")?.Value.Should().Be(1);
        }

        [Fact]
        public void Execute_DrawingOwner_SetToReservationOwner()
        {
            var (ctx, pluginCtx, _, ownerId) = BuildContext(new[] { 1 });

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            drawing.GetAttributeValue<EntityReference>("ownerid")?.Id.Should().Be(ownerId);
        }

        [Fact]
        public void Execute_DrawingCompositionLookups_CopiedFromReservation()
        {
            var (ctx, pluginCtx, reservationId, _) = BuildContext(new[] { 1 });
            var reservation  = ctx.CreateQuery(ReservationEntity).Single();
            var expectedBiz  = reservation.GetAttributeValue<EntityReference>("enmax_acdnbusiness")?.Id;

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            var actualBiz  = drawing.GetAttributeValue<EntityReference>("enmax_acdnbusiness")?.Id;
            var actualRes  = drawing.GetAttributeValue<EntityReference>("enmax_acdnreservation")?.Id;

            actualBiz.Should().Be(expectedBiz);
            actualRes.Should().Be(reservationId);
        }

        [Fact]
        public void Execute_CreatesSheets_PerDrawingMatchingSheetsPerDrawing()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1, 2 }, sheetsPer: 3);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(SheetEntity).ToList().Should().HaveCount(6); // 2 drawings × 3 sheets
        }

        [Fact]
        public void Execute_SheetNumbers_AreSequential()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1 }, sheetsPer: 3);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            var sheetNumbers = ctx.CreateQuery(SheetEntity)
                .Select(e => e.GetAttributeValue<int>("enmax_acdnsheetnumber"))
                .OrderBy(n => n)
                .ToList();

            sheetNumbers.Should().Equal(1, 2, 3);
        }

        [Fact]
        public void Execute_SheetOwner_SetToReservationOwner()
        {
            var (ctx, pluginCtx, _, ownerId) = BuildContext(new[] { 1 }, sheetsPer: 1);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            var sheet = ctx.CreateQuery(SheetEntity).Single();
            sheet.GetAttributeValue<EntityReference>("ownerid")?.Id.Should().Be(ownerId);
        }

        [Fact]
        public void Execute_SheetLinked_ToItsDrawing()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1 }, sheetsPer: 1);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            var drawing    = ctx.CreateQuery(DrawingEntity).Single();
            var sheet      = ctx.CreateQuery(SheetEntity).Single();
            var drawingRef = sheet.GetAttributeValue<EntityReference>("enmax_acdndrawing")?.Id;

            drawingRef.Should().Be(drawing.Id);
        }

        [Fact]
        public void Execute_DefaultsToOneSheet_WhenSheetsPer_IsZero()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1 }, sheetsPer: 0);

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(SheetEntity).ToList().Should().HaveCount(1);
        }

        [Fact]
        public void Execute_Output_DrawingsCreatedMatchesCount()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 10, 11, 12, 13 });

            ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);

            pluginCtx.OutputParameters["DrawingsCreated"].Should().Be(4);
        }

        // ── Guard cases ──────────────────────────────────────────────────────────

        [Fact]
        public void Execute_MissingTarget_Throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1 });
            pluginCtx.InputParameters.Remove("Target");

            Action act = () => ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*Target*");
        }

        [Fact]
        public void Execute_WrongEntityTarget_Throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1 });
            pluginCtx.InputParameters["Target"] = new EntityReference("wrong_entity", Guid.NewGuid());

            Action act = () => ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*enmax_autocadreservation*");
        }

        [Fact]
        public void Execute_MissingIssuedNumbers_Throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1 });
            pluginCtx.InputParameters.Remove("IssuedNumbers");

            Action act = () => ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*IssuedNumbers*");
        }

        [Fact]
        public void Execute_InvalidJsonIssuedNumbers_Throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1 });
            pluginCtx.InputParameters["IssuedNumbers"] = "not-json";

            Action act = () => ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*not valid JSON*");
        }

        [Fact]
        public void Execute_MissingSequenceKey_Throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1 });
            pluginCtx.InputParameters.Remove("SequenceKey");

            Action act = () => ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*SequenceKey*");
        }

        [Fact]
        public void Execute_EmptyIssuedNumbers_Throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(new[] { 1 });
            pluginCtx.InputParameters["IssuedNumbers"] = "[]";

            Action act = () => ctx.ExecutePluginWith<CreateDrawingsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*at least one number*");
        }
    }
}
