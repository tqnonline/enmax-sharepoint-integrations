using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class MarkObsoletePluginTests
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColDrawingState = "enmax_acdnstate";
        private const int StateAvailable = 1;
        private const int StateObsolete  = 5;
        private const int StateVoid      = 6;
        private const int StateFinalized = 7;

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid drawingId)
            BuildContext(int drawingState = StateAvailable)
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var drawing = new Entity(DrawingEntity, drawingId) { [ColDrawingState] = new OptionSetValue(drawingState) };
            var sheet   = new Entity(SheetEntity, Guid.NewGuid())
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(2),
            };
            ctx.Initialize(new[] { drawing, sheet });
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnMarkObsolete";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = Guid.NewGuid();
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);
            pluginCtx.InputParameters["Reason"] = string.Empty;
            return (ctx, pluginCtx, drawingId);
        }

        [Fact]
        public void NonTerminal_drawing_becomes_Obsolete_with_sheets_mirrored()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);
            ctx.ExecutePluginWith<MarkObsoletePlugin>(pluginCtx);
            var svc = ctx.GetFakedOrganizationService();
            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
               .GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StateObsolete);
            svc.RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_acdnstate") })
               .Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 5,
                   because: "sheet Obsolete = 5 mirrors the drawing");
        }

        [Fact]
        public void Obsolete_writes_StateChanged_audit_to_drawing()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);
            ctx.ExecutePluginWith<MarkObsoletePlugin>(pluginCtx);
            var audit = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) })
                .Entities[0];
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(2, because: "event 2 = State Changed");
            audit.GetAttributeValue<string>("enmax_acdntostate").Should().Be("Obsolete");
            audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString());
        }

        [Theory]
        [InlineData(StateObsolete)]
        [InlineData(StateVoid)]
        [InlineData(StateFinalized)]
        public void Terminal_drawing_throws(int terminalState)
        {
            var (ctx, pluginCtx, _) = BuildContext(terminalState);
            Action act = () => ctx.ExecutePluginWith<MarkObsoletePlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>(
                because: "a terminal drawing (Obsolete/Void/Finalized) cannot be marked obsolete");
        }
    }
}
