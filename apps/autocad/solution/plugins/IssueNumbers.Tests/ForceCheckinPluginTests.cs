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
    /// <summary>
    /// Unit tests for ForceCheckinPlugin.
    /// Custom API: enmax_acdnForceCheckin (bound to enmax_autocadcheckout)
    /// </summary>
    public class ForceCheckinPluginTests
    {
        // -----------------------------------------------------------------------
        // Constants
        // -----------------------------------------------------------------------

        private const string CheckoutEntity     = "enmax_autocadcheckout";
        private const string DrawingEntity      = "enmax_autocaddrawing";
        private const string ColCheckoutStatus  = "enmax_acdnstatus";
        private const string ColCheckoutDrawing = "enmax_acdndrawing";
        private const string ColDrawingState    = "enmax_acdnstate";

        private const int StatusOpen           = 1;
        private const int StatusClosedApproved = 3;
        private const int StatusClosedDeclined = 4;
        private const int StatusClosedForced   = 5;
        private const int StateAvailable       = 1;
        private const int StateCheckedOut      = 2;

        private const string ValidReason = "Admin override: user unavailable for two weeks, deadline passed.";

        // -----------------------------------------------------------------------
        // Helpers
        // -----------------------------------------------------------------------

        private static readonly Guid AdminTeamId    = Guid.NewGuid();
        private static readonly Guid ApproverTeamId = Guid.NewGuid();

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid checkoutId, Guid drawingId)
            BuildContext(int checkoutStatus = StatusOpen)
        {
            var ctx        = new XrmFakedContext();
            var drawingId  = Guid.NewGuid();
            var checkoutId = Guid.NewGuid();
            var userId     = Guid.NewGuid(); // will be put in the Approver team

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState] = new OptionSetValue(StateCheckedOut),
            };

            var checkout = new Entity(CheckoutEntity, checkoutId)
            {
                [ColCheckoutStatus]  = new OptionSetValue(checkoutStatus),
                [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
            };

            ctx.Initialize(new Entity[]
            {
                drawing, checkout,
                // AppConfig
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
                // Acting user is in the Approver team.
                new Entity("teammembership", Guid.NewGuid())
                {
                    ["teamid"]       = ApproverTeamId,
                    ["systemuserid"] = userId,
                },
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnForceCheckin";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, userId);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"]      = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["Reason"]      = ValidReason;
            pluginCtx.InputParameters["NewRevision"] = "C";

            return (ctx, pluginCtx, checkoutId, drawingId);
        }

        // -----------------------------------------------------------------------
        // Happy path
        // -----------------------------------------------------------------------

        [Fact]
        public void Open_checkout_is_force_closed_and_drawing_returned_to_Available()
        {
            var (ctx, pluginCtx, checkoutId, drawingId) = BuildContext(StatusOpen);

            ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

            var svc      = ctx.GetFakedOrganizationService();
            var checkout = svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus));
            var drawing  = svc.Retrieve(DrawingEntity,  drawingId,  new ColumnSet(ColDrawingState));

            checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
                    .Should().Be(StatusClosedForced,
                        because: "ForceCheckin must close the checkout with ClosedForced status");

            drawing.GetAttributeValue<OptionSetValue>(ColDrawingState).Value
                   .Should().Be(StateAvailable,
                       because: "ForceCheckin must return the drawing to Available so it can be checked out again");
        }

        [Fact]
        public void ForceCheckin_stamps_admin_as_closedBy()
        {
            var (ctx, pluginCtx, checkoutId, _) = BuildContext(StatusOpen);
            var expectedUserId = pluginCtx.InitiatingUserId;

            ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

            var checkout = ctx.GetFakedOrganizationService()
                              .Retrieve(CheckoutEntity, checkoutId, new ColumnSet("enmax_acdnclosedby"));

            checkout.GetAttributeValue<EntityReference>("enmax_acdnclosedby").Id
                    .Should().Be(expectedUserId,
                        because: "closedBy must reference the admin who forced the check-in");
        }

        [Fact]
        public void ForceCheckin_records_reason_on_checkout()
        {
            var (ctx, pluginCtx, checkoutId, _) = BuildContext(StatusOpen);

            ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

            var checkout = ctx.GetFakedOrganizationService()
                              .Retrieve(CheckoutEntity, checkoutId, new ColumnSet("enmax_acdnvalidationreason"));

            checkout.GetAttributeValue<string>("enmax_acdnvalidationreason")
                    .Should().NotBeNullOrEmpty(
                        because: "the admin's reason must be persisted so the original checkout owner can see why it was forced");
        }

        [Fact]
        public void ForceCheckin_returns_output_parameters()
        {
            var (ctx, pluginCtx, checkoutId, _) = BuildContext(StatusOpen);

            ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

            pluginCtx.OutputParameters["CheckoutId"].Should().Be(checkoutId.ToString());
            Convert.ToInt32(pluginCtx.OutputParameters["DrawingState"]).Should().Be(StateAvailable);
        }

        [Fact]
        public void ForceCheckin_creates_audit_event()
        {
            var (ctx, pluginCtx, checkoutId, _) = BuildContext(StatusOpen);

            ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

            var audits = ctx.GetFakedOrganizationService()
                            .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent")
                            {
                                ColumnSet = new ColumnSet(true),
                            });

            audits.Entities.Should().HaveCount(1,
                because: "ForceCheckin must write exactly one audit event");

            audits.Entities[0].GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value
                  .Should().Be(6, because: "event type 6 = ForceCheckedIn");
        }

        // -----------------------------------------------------------------------
        // Idempotency
        // -----------------------------------------------------------------------

        [Fact]
        public void Already_ClosedApproved_checkout_is_a_no_op()
        {
            var (ctx, pluginCtx, checkoutId, _) = BuildContext(StatusClosedApproved);

            Action act = () => ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

            act.Should().NotThrow(
                because: "ForceCheckin must be idempotent when the checkout is already closed");

            var checkout = ctx.GetFakedOrganizationService()
                              .Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus));

            checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
                    .Should().Be(StatusClosedApproved,
                        because: "an already-approved checkout must not be re-closed as forced");
        }

        [Fact]
        public void Already_ClosedForced_checkout_is_a_no_op()
        {
            var (ctx, pluginCtx, checkoutId, _) = BuildContext(StatusClosedForced);

            Action act = () => ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

            act.Should().NotThrow(
                because: "calling ForceCheckin on an already force-closed checkout must be idempotent");
        }

        // -----------------------------------------------------------------------
        // Guard / error cases
        // -----------------------------------------------------------------------

        [Fact]
        public void Missing_reason_throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(StatusOpen);
            pluginCtx.InputParameters["Reason"] = string.Empty;

            Action act = () => ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*Reason*",
                   because: "Reason is required — forcing without reason produces an audit trail the original user cannot interpret");
        }

        [Fact]
        public void Missing_Target_throws()
        {
            var ctx       = new XrmFakedContext();
            var pluginCtx = ctx.GetDefaultPluginContext();
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, Guid.NewGuid());
            pluginCtx.MessageName      = "enmax_acdnForceCheckin";
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Reason"] = ValidReason;

            Action act = () => ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*Target*");
        }

        [Fact]
        public void Wrong_entity_type_throws()
        {
            var ctx       = new XrmFakedContext();
            var pluginCtx = ctx.GetDefaultPluginContext();
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, Guid.NewGuid());
            pluginCtx.MessageName      = "enmax_acdnForceCheckin";
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference("account", Guid.NewGuid());
            pluginCtx.InputParameters["Reason"] = ValidReason;

            Action act = () => ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage($"*{CheckoutEntity}*");
        }

        // -----------------------------------------------------------------------
        // New spec tests
        // -----------------------------------------------------------------------

        [Fact]
        public void ForceCheckin_bumps_revision_on_drawing()
        {
            var (ctx, pluginCtx, _, drawingId) = BuildContext(StatusOpen);
            ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);
            var drawing = ctx.GetFakedOrganizationService()
                .Retrieve(DrawingEntity, drawingId, new ColumnSet("enmax_acdncurrentrevision"));
            drawing.GetAttributeValue<string>("enmax_acdncurrentrevision").Should().Be("C",
                because: "force check-in must stamp the admin-provided revision on the drawing");
        }

        [Fact]
        public void ForceCheckin_audit_is_keyed_to_the_drawing()
        {
            var (ctx, pluginCtx, _, drawingId) = BuildContext(StatusOpen);
            ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);
            var audit = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) })
                .Entities[0];
            audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString(),
                because: "force check-in audit must appear on the drawing timeline");
            audit.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be(DrawingEntity);
        }

        [Fact]
        public void ForceCheckin_moves_sheets_to_Available()
        {
            var ctx        = new XrmFakedContext();
            var drawingId  = Guid.NewGuid();
            var checkoutId = Guid.NewGuid();
            var userId     = Guid.NewGuid();
            var drawing  = new Entity(DrawingEntity, drawingId)  { [ColDrawingState] = new OptionSetValue(StateCheckedOut) };
            var checkout = new Entity(CheckoutEntity, checkoutId)
            {
                [ColCheckoutStatus]  = new OptionSetValue(StatusOpen),
                [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
            };
            var sheet = new Entity("enmax_autocadsheet", Guid.NewGuid())
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(3),
            };
            ctx.Initialize(new Entity[]
            {
                drawing, checkout, sheet,
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
                    ["systemuserid"] = userId,
                },
            });
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnForceCheckin";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, userId);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"]      = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["Reason"]      = ValidReason;
            pluginCtx.InputParameters["NewRevision"] = "C";
            ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);
            var sheets = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") });
            sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 2,
                because: "force check-in returns sheets to sheet Available = 2");
        }

        [Fact]
        public void Missing_NewRevision_stamps_an_internal_cycle_token()
        {
            // WS3: the revision number is gone. Force check-in no longer requires NewRevision — when
            // omitted it stamps an internal cycle token so the drawing keeps a "has been checked in" marker.
            var (ctx, pluginCtx, _, drawingId) = BuildContext(StatusOpen);
            pluginCtx.InputParameters["NewRevision"] = string.Empty;
            Action act = () => ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);
            act.Should().NotThrow(because: "NewRevision is optional in WS3 — an internal token is stamped when omitted");
            ctx.GetFakedOrganizationService()
               .Retrieve(DrawingEntity, drawingId, new ColumnSet("enmax_acdncurrentrevision"))
               .GetAttributeValue<string>("enmax_acdncurrentrevision").Should().NotBeNullOrEmpty(
                   because: "a cycle token must still be stamped so Finalize/Obsolete gating keeps working");
        }

        [Fact]
        public void Non_approver_non_admin_cannot_force_checkin()
        {
            var ctx        = new XrmFakedContext();
            var drawingId  = Guid.NewGuid();
            var checkoutId = Guid.NewGuid();
            var actingUser = Guid.NewGuid(); // not in any team

            var drawing  = new Entity(DrawingEntity, drawingId)  { [ColDrawingState] = new OptionSetValue(StateCheckedOut) };
            var checkout = new Entity(CheckoutEntity, checkoutId)
            {
                [ColCheckoutStatus]  = new OptionSetValue(StatusOpen),
                [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
            };
            ctx.Initialize(new Entity[]
            {
                drawing, checkout,
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
                // No teammembership — actingUser is neither approver nor admin.
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnForceCheckin";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, actingUser);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"]      = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["Reason"]      = ValidReason;
            pluginCtx.InputParameters["NewRevision"] = "C";

            Action act = () => ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*not authorized*",
                   because: "only approvers and admins may force a check-in; plain users must be denied");

            // Checkout must remain Open — no changes applied.
            ctx.GetFakedOrganizationService()
               .Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus))
               .GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
               .Should().Be(StatusOpen, because: "the gate fires before any state change");
        }
    }
}
