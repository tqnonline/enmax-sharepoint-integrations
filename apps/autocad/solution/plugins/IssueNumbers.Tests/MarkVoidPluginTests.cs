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
    public class MarkVoidPluginTests
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColDrawingState = "enmax_acdnstate";
        private const int StateAvailable = 1;
        private const int StateVoid      = 6;
        private const int StateFinalized = 7;
        private const string ValidReason = "Reservation was cancelled by the requesting business; drawing no longer required.";

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid drawingId)
            BuildContext(int drawingState = StateAvailable, string reason = ValidReason)
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
            pluginCtx.MessageName      = "enmax_acdnMarkVoid";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = Guid.NewGuid();
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);
            pluginCtx.InputParameters["Reason"] = reason;
            return (ctx, pluginCtx, drawingId);
        }

        [Fact]
        public void NonTerminal_drawing_becomes_Void_with_sheets_mirrored_and_reason_audited()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);
            ctx.ExecutePluginWith<MarkVoidPlugin>(pluginCtx);
            var svc = ctx.GetFakedOrganizationService();
            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
               .GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StateVoid);
            svc.RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_acdnstate") })
               .Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 6);
            var audit = svc.RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) }).Entities[0];
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(2);
            audit.GetAttributeValue<string>("enmax_acdntostate").Should().Be("Void");
            audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString());
            audit.GetAttributeValue<string>("enmax_acdnreason").Should().NotBeNullOrEmpty();
        }

        [Fact]
        public void Short_reason_throws()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable, reason: "nope");
            Action act = () => ctx.ExecutePluginWith<MarkVoidPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*10*",
                because: "void requires a reason of at least 10 characters");
        }

        [Theory]
        [InlineData(StateVoid)]
        [InlineData(StateFinalized)]
        public void Terminal_drawing_throws(int terminalState)
        {
            var (ctx, pluginCtx, _) = BuildContext(terminalState);
            Action act = () => ctx.ExecutePluginWith<MarkVoidPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>();
        }
    }
}
