using Enmax.AutoCAD;
using FakeXrmEasy;
using FakeXrmEasy.FakeMessageExecutors;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class FinalizeDrawingPluginTests
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColDrawingState = "enmax_acdnstate";

        private const int StateAvailable  = 1;
        private const int StateCheckedOut = 2;
        private const int StateFinalized  = 7;

        private const string ValidReason = "This is the final issued-for-construction revision; no further changes expected.";

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid drawingId)
            BuildContext(int drawingState = StateAvailable)
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var userId    = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId) { [ColDrawingState] = new OptionSetValue(drawingState) };
            var sheet   = new Entity(SheetEntity, Guid.NewGuid())
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(2),
            };
            ctx.Initialize(new[] { drawing, sheet });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnFinalizeDrawing";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = userId;
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);
            pluginCtx.InputParameters["Reason"] = ValidReason;

            return (ctx, pluginCtx, drawingId);
        }

        [Fact]
        public void Available_drawing_transitions_to_Finalized()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);
            ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);
            var drawing = ctx.GetFakedOrganizationService()
                .Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState));
            drawing.GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StateFinalized,
                because: "finalising an Available drawing must move it to the terminal Finalized state");
        }

        [Fact]
        public void Finalize_moves_sheets_to_Finalized()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable);
            ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);
            var sheets = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_acdnstate") });
            sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 7,
                because: "sheets mirror the drawing into Finalized = 7");
        }

        [Fact]
        public void Finalize_writes_Finalized_audit_keyed_to_drawing_with_reason()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);
            ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);
            var audit = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) })
                .Entities[0];
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(9, because: "event 9 = Finalized");
            audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString());
            audit.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be(DrawingEntity);
            audit.GetAttributeValue<string>("enmax_acdnreason").Should().NotBeNullOrEmpty(
                because: "the finalisation reason must be persisted for the audit trail");
        }

        [Fact]
        public void Non_Available_drawing_throws()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateCheckedOut);
            Action act = () => ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage($"*{StateCheckedOut}*",
                because: "only an Available drawing can be finalised; the message must include the current state");
        }

        [Fact]
        public void Short_reason_throws()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable);
            pluginCtx.InputParameters["Reason"] = "too short";
            Action act = () => ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*10*",
                because: "finalisation reason must be at least 10 characters");
        }

        [Fact]
        public void ConcurrencyVersionMismatch_propagates_to_caller()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable);
            var fault = new OrganizationServiceFault { ErrorCode = -2147088254, Message = "ConcurrencyVersionMismatch" };
            ctx.AddFakeMessageExecutor<UpdateRequest>(
                new AlwaysThrowUpdateExecutor(new FaultException<OrganizationServiceFault>(fault, fault.Message)));
            Action act = () => ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*ConcurrencyVersionMismatch*",
                because: "two simultaneous finalisations must not both succeed; the loser must be told to retry");
        }
    }
}
