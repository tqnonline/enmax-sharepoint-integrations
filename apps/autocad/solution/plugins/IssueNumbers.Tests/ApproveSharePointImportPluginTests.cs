using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Collections.Generic;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Unit tests for ApproveSharePointImportPlugin.
    /// Custom API: enmax_acdnApproveSharePointImport (bound to enmax_autocaddrawing)
    /// </summary>
    public class ApproveSharePointImportPluginTests
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string ColDrawingState = "enmax_acdnstate";
        private const string ColDrawingNumber = "enmax_acdnnumber";
        private const string ColSpImportApprovedOn = "enmax_acdnspimportapprovedon";

        private const int StatePendingImport = 8;
        private const int StateAvailable     = 1;
        private const int StateCheckedOut    = 2;

        private const string Number = "GG-CG-00-ECS-AST-DD-0007";

        private static readonly Guid AdminTeamId    = Guid.NewGuid();
        private static readonly Guid ApproverTeamId = Guid.NewGuid();

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid drawingId) BuildContext(
            int drawingState = StatePendingImport,
            string number = Number,
            bool actorIsApprover = true,
            IEnumerable<Entity> extraSeed = null)
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var actingUser = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState]  = new OptionSetValue(drawingState),
                [ColDrawingNumber] = number,
            };

            var seed = new List<Entity>
            {
                drawing,
                new Entity("enmax_autocadappconfig", Guid.NewGuid()) { ["enmax_acdnkey"] = "AdminTeamId",    ["enmax_acdnvalue"] = AdminTeamId.ToString() },
                new Entity("enmax_autocadappconfig", Guid.NewGuid()) { ["enmax_acdnkey"] = "ApproverTeamId", ["enmax_acdnvalue"] = ApproverTeamId.ToString() },
            };
            if (actorIsApprover)
                seed.Add(new Entity("teammembership", Guid.NewGuid()) { ["teamid"] = ApproverTeamId, ["systemuserid"] = actingUser });
            if (extraSeed != null)
                seed.AddRange(extraSeed);

            ctx.Initialize(seed);

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName = "enmax_acdnApproveSharePointImport";
            pluginCtx.Stage       = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, actingUser);
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);

            return (ctx, pluginCtx, drawingId);
        }

        [Fact]
        public void Approve_moves_PendingImport_drawing_to_Available_and_stamps_approvedOn()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext();

            ctx.ExecutePluginWith<ApproveSharePointImportPlugin>(pluginCtx);

            var updated = ctx.GetFakedOrganizationService()
                .Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState, ColSpImportApprovedOn));
            updated.GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StateAvailable);
            updated.GetAttributeValue<DateTime?>(ColSpImportApprovedOn).Should().NotBeNull();

            pluginCtx.OutputParameters["DrawingId"].Should().Be(drawingId.ToString());
            Convert.ToInt32(pluginCtx.OutputParameters["NewState"]).Should().Be(StateAvailable);
        }

        [Fact]
        public void Approve_of_non_pending_drawing_throws()
        {
            var (ctx, pluginCtx, _) = BuildContext(drawingState: StateAvailable);

            Action act = () => ctx.ExecutePluginWith<ApproveSharePointImportPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*Pending SharePoint Import*");
        }

        [Fact]
        public void Approve_with_duplicate_number_on_another_non_pending_drawing_throws()
        {
            var conflict = new Entity(DrawingEntity, Guid.NewGuid())
            {
                [ColDrawingState]  = new OptionSetValue(StateCheckedOut),
                [ColDrawingNumber] = Number,
            };
            var (ctx, pluginCtx, drawingId) = BuildContext(extraSeed: new[] { conflict });

            Action act = () => ctx.ExecutePluginWith<ApproveSharePointImportPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*already in use*");

            ctx.GetFakedOrganizationService()
                .Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
                .GetAttributeValue<OptionSetValue>(ColDrawingState).Value
                .Should().Be(StatePendingImport, because: "a rejected approval must not change state");
        }

        [Fact]
        public void Approve_ignores_conflicts_against_other_pending_imports()
        {
            var otherPending = new Entity(DrawingEntity, Guid.NewGuid())
            {
                [ColDrawingState]  = new OptionSetValue(StatePendingImport),
                [ColDrawingNumber] = Number,
            };
            var (ctx, pluginCtx, drawingId) = BuildContext(extraSeed: new[] { otherPending });

            Action act = () => ctx.ExecutePluginWith<ApproveSharePointImportPlugin>(pluginCtx);

            act.Should().NotThrow(because: "two pending stubs sharing a number are not yet a real conflict");
            ctx.GetFakedOrganizationService()
                .Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
                .GetAttributeValue<OptionSetValue>(ColDrawingState).Value
                .Should().Be(StateAvailable);
        }

        [Fact]
        public void Non_approver_non_admin_cannot_approve()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(actorIsApprover: false);

            Action act = () => ctx.ExecutePluginWith<ApproveSharePointImportPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*not authorized*");
            ctx.GetFakedOrganizationService()
                .Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
                .GetAttributeValue<OptionSetValue>(ColDrawingState).Value
                .Should().Be(StatePendingImport);
        }

        [Fact]
        public void Wrong_entity_type_throws()
        {
            var ctx       = new XrmFakedContext();
            ctx.Initialize(new List<Entity>());
            var pluginCtx = ctx.GetDefaultPluginContext();
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, Guid.NewGuid());
            pluginCtx.MessageName = "enmax_acdnApproveSharePointImport";
            pluginCtx.InputParameters["Target"] = new EntityReference("account", Guid.NewGuid());
            Action act = () => ctx.ExecutePluginWith<ApproveSharePointImportPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage($"*{DrawingEntity}*");
        }
    }
}
