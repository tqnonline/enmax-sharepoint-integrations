using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using System;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Unit tests for ApproveReservationPlugin.
    /// Custom API: enmax_acdnApproveReservation (bound to enmax_autocadreservation)
    /// </summary>
    public class ApproveReservationPluginTests
    {
        // -----------------------------------------------------------------------
        // Constants
        // -----------------------------------------------------------------------

        private const string EntityName    = "enmax_autocadreservation";
        private const string ColStatus     = "enmax_acdnstatus";
        private const string ColApprovedOn = "enmax_acdnapprovedon";
        private const string ColApprover   = "enmax_acdnapprover";

        private const int StatusPending  = 1;
        private const int StatusApproved = 2;
        private const int StatusDeclined = 3;

        // -----------------------------------------------------------------------
        // Helpers
        // -----------------------------------------------------------------------

        private static readonly Guid ApproverTeamId = Guid.NewGuid();
        private static readonly Guid AdminTeamId     = Guid.NewGuid();

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid reservationId)
            BuildContext(int status)
        {
            var ctx           = new XrmFakedContext();
            var reservationId = Guid.NewGuid();
            var approverId    = Guid.NewGuid();

            var reservation = new Entity(EntityName, reservationId)
            {
                [ColStatus] = new OptionSetValue(status),
            };

            // Seed authz: AppConfig + approver membership so the gate passes.
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
                    ["systemuserid"] = approverId,
                },
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName          = "enmax_acdnApproveReservation";
            pluginCtx.Stage                = 40; // PostOperation
            pluginCtx.InitiatingUserId     = approverId;
            pluginCtx.InputParameters      = new ParameterCollection();
            pluginCtx.OutputParameters     = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(EntityName, reservationId);

            return (ctx, pluginCtx, reservationId);
        }

        // -----------------------------------------------------------------------
        // Tests
        // -----------------------------------------------------------------------

        [Fact]
        public void Pending_reservation_is_approved_and_stamped()
        {
            var (ctx, pluginCtx, reservationId) = BuildContext(StatusPending);
            var plugin = new ApproveReservationPlugin();

            ctx.ExecutePluginWith<ApproveReservationPlugin>(pluginCtx);

            var updated = ctx.GetFakedOrganizationService()
                             .Retrieve(EntityName, reservationId, new Microsoft.Xrm.Sdk.Query.ColumnSet(true));

            updated.GetAttributeValue<OptionSetValue>(ColStatus).Value
                   .Should().Be(StatusApproved,
                       because: "approve action must transition status from Pending to Approved");

            updated.GetAttributeValue<EntityReference>(ColApprover)
                   .Should().NotBeNull(because: "approver lookup must be stamped");

            updated.GetAttributeValue<DateTime>(ColApprovedOn)
                   .Should().BeCloseTo(DateTime.UtcNow, precision: TimeSpan.FromSeconds(5),
                       because: "approvedOn must be set to the current UTC time");
        }

        [Fact]
        public void Already_approved_reservation_is_a_no_op_idempotent()
        {
            var (ctx, pluginCtx, reservationId) = BuildContext(StatusApproved);

            // Should not throw — idempotent behaviour
            Action act = () => ctx.ExecutePluginWith<ApproveReservationPlugin>(pluginCtx);

            act.Should().NotThrow(
                because: "approving an already-approved reservation must be a silent no-op");
        }

        [Fact]
        public void Declined_reservation_throws_InvalidPluginExecutionException()
        {
            var (ctx, pluginCtx, _) = BuildContext(StatusDeclined);

            Action act = () => ctx.ExecutePluginWith<ApproveReservationPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage($"*{StatusDeclined}*",
                   because: "approving a declined reservation must be rejected with the current status in the message");
        }

        [Fact]
        public void Missing_Target_parameter_throws()
        {
            var ctx       = new XrmFakedContext();
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnApproveReservation";
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            // no Target added

            Action act = () => ctx.ExecutePluginWith<ApproveReservationPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*Target*",
                   because: "plugin must fail loudly when no Target entity reference is supplied");
        }

        [Fact]
        public void Wrong_entity_type_on_Target_throws()
        {
            var ctx       = new XrmFakedContext();
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnApproveReservation";
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference("account", Guid.NewGuid());

            Action act = () => ctx.ExecutePluginWith<ApproveReservationPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage($"*{EntityName}*",
                   because: "plugin must reject a Target that is not an enmax_autocadreservation");
        }

        [Fact]
        public void Approver_is_set_to_the_initiating_user()
        {
            var (ctx, pluginCtx, reservationId) = BuildContext(StatusPending);
            var expectedApproverId = pluginCtx.InitiatingUserId;

            ctx.ExecutePluginWith<ApproveReservationPlugin>(pluginCtx);

            var updated = ctx.GetFakedOrganizationService()
                             .Retrieve(EntityName, reservationId, new Microsoft.Xrm.Sdk.Query.ColumnSet(ColApprover));

            updated.GetAttributeValue<EntityReference>(ColApprover).Id
                   .Should().Be(expectedApproverId,
                       because: "the approver lookup must point to the user who called the action, not the plugin run-as user");
        }

        [Fact]
        public void UnauthorizedUser_cannot_approve_reservation_and_state_unchanged()
        {
            // Arrange: a plain user (not in any team) tries to approve a Pending reservation
            var ctx           = new XrmFakedContext();
            var reservationId = Guid.NewGuid();
            var plainUserId   = Guid.NewGuid();

            ctx.Initialize(new[]
            {
                new Entity(EntityName, reservationId) { [ColStatus] = new OptionSetValue(StatusPending) },
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
                // No teammembership for plainUserId
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnApproveReservation";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = plainUserId;
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(EntityName, reservationId);

            Action act = () => ctx.ExecutePluginWith<ApproveReservationPlugin>(pluginCtx);

            // Act + Assert: must throw "not authorized" and leave status as Pending
            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*not authorized*",
                   because: "a user outside the Admin/Approver teams must be denied");

            var unchanged = ctx.GetFakedOrganizationService()
                               .Retrieve(EntityName, reservationId, new Microsoft.Xrm.Sdk.Query.ColumnSet(ColStatus));
            unchanged.GetAttributeValue<OptionSetValue>(ColStatus).Value
                     .Should().Be(StatusPending,
                         because: "authorization failure must leave the reservation status unchanged (no partial write)");
        }
    }
}
