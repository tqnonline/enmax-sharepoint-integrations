using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using Xunit;

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class DrawingRollupHelperTests
    {
        private const string DrawingEntity = "enmax_autocaddrawing";
        private const string SheetEntity = "enmax_autocadsheet";

        private static (XrmFakedContext ctx, Guid drawingId) Build(params int[] sheetStates)
        {
            var ctx = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var seed = new System.Collections.Generic.List<Entity>
            {
                new Entity(DrawingEntity, drawingId) { ["enmax_acdnstate"] = new OptionSetValue(1) },
            };
            foreach (var state in sheetStates)
            {
                seed.Add(new Entity(SheetEntity, Guid.NewGuid())
                {
                    ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                    ["enmax_acdnstate"] = new OptionSetValue(state),
                });
            }

            ctx.Initialize(seed);
            return (ctx, drawingId);
        }

        [Fact]
        public void Rollup_PrioritizesCheckedOut()
        {
            var (ctx, drawingId) = Build(2, 3, 4);
            var state = DrawingRollupHelper.RecomputeDrawingRollup(ctx.GetFakedOrganizationService(), drawingId);
            state.Should().Be(2);
        }

        [Fact]
        public void Rollup_UsesAwaitingValidationWhenNoCheckedOut()
        {
            var (ctx, drawingId) = Build(2, 4, 2);
            var state = DrawingRollupHelper.RecomputeDrawingRollup(ctx.GetFakedOrganizationService(), drawingId);
            state.Should().Be(3);
        }

        [Fact]
        public void Rollup_UsesTerminalStateWhenUniform()
        {
            var (ctx, drawingId) = Build(7, 7);
            var state = DrawingRollupHelper.RecomputeDrawingRollup(ctx.GetFakedOrganizationService(), drawingId);
            state.Should().Be(7);
        }

        [Fact]
        public void Rollup_FallsBackToAvailableForMixedTerminalAndAvailable()
        {
            var (ctx, drawingId) = Build(2, 5);
            var state = DrawingRollupHelper.RecomputeDrawingRollup(ctx.GetFakedOrganizationService(), drawingId);
            state.Should().Be(1);
        }

        [Fact]
        public void Rollup_NoSheetsAvailableState()
        {
            var (ctx, drawingId) = Build();
            var state = DrawingRollupHelper.RecomputeDrawingRollup(ctx.GetFakedOrganizationService(), drawingId);
            state.Should().Be(1);

            var drawing = ctx.GetFakedOrganizationService().Retrieve(DrawingEntity, drawingId, new ColumnSet("enmax_acdnstate"));
            drawing.GetAttributeValue<OptionSetValue>("enmax_acdnstate")?.Value.Should().Be(1);
        }
    }
}
