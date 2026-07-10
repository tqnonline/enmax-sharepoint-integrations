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
    /// <summary>
    /// Unit tests for CheckOutDrawingPlugin.
    /// Custom API: enmax_acdnCheckOutDrawing (bound to enmax_autocaddrawing)
    /// </summary>
    public class CheckOutDrawingPluginTests
    {
        // -----------------------------------------------------------------------
        // Constants
        // -----------------------------------------------------------------------

        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string CheckoutEntity  = "enmax_autocadcheckout";
        private const string ColDrawingState = "enmax_acdnstate";
        private const string ColCheckedOutBy = "enmax_acdncheckedoutby";

        private const int StateAvailable  = 1;
        private const int StateCheckedOut = 2;
        private const int StatusOpen      = 1;
        private const int StatusRequested = 6;

        // -----------------------------------------------------------------------
        // Helpers
        // -----------------------------------------------------------------------

        private static readonly Guid AdminTeamId    = Guid.NewGuid();
        private static readonly Guid ApproverTeamId = Guid.NewGuid();

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid drawingId)
            BuildContext(int drawingState = StateAvailable, bool requireApproval = false)
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var userId    = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState] = new OptionSetValue(drawingState),
                // Owner = acting user so the authorization gate passes.
                ["ownerid"]       = new EntityReference("systemuser", userId),
            };

            ctx.Initialize(new Entity[]
            {
                drawing,
                // AppConfig entries so Authorization helper can resolve teams.
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
                // WS3: gate flag. Defaults TRUE when absent, so the legacy immediate-checkout
                // tests explicitly seed false; gated tests seed true.
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "RequireCheckOutApproval",
                    ["enmax_acdnvalue"] = requireApproval ? "true" : "false",
                },
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnCheckOutDrawing";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, userId);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);

            return (ctx, pluginCtx, drawingId);
        }

        // -----------------------------------------------------------------------
        // Tests
        // -----------------------------------------------------------------------

        [Fact]
        public void Available_drawing_transitions_to_CheckedOut()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);

            ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            var updated = ctx.GetFakedOrganizationService()
                             .Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState));

            updated.GetAttributeValue<OptionSetValue>(ColDrawingState).Value
                   .Should().Be(StateCheckedOut,
                       because: "CheckOut must transition the drawing state from Available to CheckedOut");
        }

        [Fact]
        public void CheckOut_creates_open_checkout_row()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);

            ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            var svc      = ctx.GetFakedOrganizationService();
            var checkouts = svc.RetrieveMultiple(new QueryExpression(CheckoutEntity)
            {
                ColumnSet = new ColumnSet(true),
            });

            checkouts.Entities.Should().HaveCount(1,
                because: "exactly one checkout row must be created per CheckOut call");

            var checkout = checkouts.Entities[0];
            checkout.GetAttributeValue<OptionSetValue>("enmax_acdnstatus").Value
                    .Should().Be(StatusOpen,
                        because: "new checkout must start in Open status");

            var drawing = checkout.GetAttributeValue<EntityReference>("enmax_acdndrawing");
            drawing.Should().NotBeNull(because: "checkout must reference its drawing");
            drawing.Id.Should().Be(drawingId,
                because: "checkout drawing lookup must point to the checked-out drawing");
        }

        [Fact]
        public void CheckOut_returns_CheckoutId_output()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable);

            ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            pluginCtx.OutputParameters.Should().ContainKey("CheckoutId",
                because: "CheckoutId output is required by the Code App to cache the checkout without a refetch");

            var checkoutId = (string)pluginCtx.OutputParameters["CheckoutId"];
            Guid.TryParse(checkoutId, out _)
                .Should().BeTrue(because: "CheckoutId must be a valid GUID string");
        }

        [Fact]
        public void CheckOut_stamps_initiating_user_on_checkout()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable);
            var expectedUserId = pluginCtx.InitiatingUserId;

            ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            var svc      = ctx.GetFakedOrganizationService();
            var checkouts = svc.RetrieveMultiple(new QueryExpression(CheckoutEntity)
            {
                ColumnSet = new ColumnSet(ColCheckedOutBy),
            });

            checkouts.Entities[0].GetAttributeValue<EntityReference>(ColCheckedOutBy).Id
                .Should().Be(expectedUserId,
                    because: "checkedOutBy must reference the user who invoked the action, not a service account");
        }

        [Fact]
        public void CheckedOut_drawing_throws_InvalidPluginExecutionException()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateCheckedOut);

            Action act = () => ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage($"*{StateCheckedOut}*",
                   because: "attempting to check out an already-checked-out drawing must fail with the current state in the message");
        }

        [Fact]
        public void Missing_Target_throws()
        {
            var ctx       = new XrmFakedContext();
            var pluginCtx = ctx.GetDefaultPluginContext();
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, Guid.NewGuid());
            pluginCtx.MessageName      = "enmax_acdnCheckOutDrawing";
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();

            Action act = () => ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*Target*",
                   because: "plugin must fail loudly when Target is missing");
        }

        [Fact]
        public void Wrong_entity_type_throws()
        {
            var ctx       = new XrmFakedContext();
            var pluginCtx = ctx.GetDefaultPluginContext();
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, Guid.NewGuid());
            pluginCtx.MessageName      = "enmax_acdnCheckOutDrawing";
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference("account", Guid.NewGuid());

            Action act = () => ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage($"*{DrawingEntity}*",
                   because: "plugin must reject a Target that is not enmax_autocaddrawing");
        }

        [Fact]
        public void ConcurrencyVersionMismatch_propagates_to_caller()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable);

            var fault  = new OrganizationServiceFault { ErrorCode = -2147088254, Message = "ConcurrencyVersionMismatch" };
            var orgEx  = new FaultException<OrganizationServiceFault>(fault, fault.Message);
            ctx.AddFakeMessageExecutor<UpdateRequest>(new AlwaysThrowUpdateExecutor(orgEx));

            Action act = () => ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*ConcurrencyVersionMismatch*",
                   because: "version-mismatch on drawing update must surface to the caller so it can retry; plugin must not swallow the fault");
        }

        [Fact]
        public void CheckOut_creates_audit_event()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);

            ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            var svc    = ctx.GetFakedOrganizationService();
            var audits = svc.RetrieveMultiple(new QueryExpression("enmax_autocadauditevent")
            {
                ColumnSet = new ColumnSet(true),
            });

            audits.Entities.Should().HaveCount(1,
                because: "CheckOut must write one audit event");

            var audit = audits.Entities[0];
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value
                 .Should().Be(2, because: "event type 2 = StateChanged");

            audit.GetAttributeValue<string>("enmax_acdnsubjectid")
                 .Should().Be(drawingId.ToString(),
                     because: "audit subject must reference the drawing that was checked out");
        }

        [Fact]
        public void Non_owner_non_admin_cannot_check_out_drawing()
        {
            // Arrange: drawing owned by someone else; acting user is a stranger.
            var ctx         = new XrmFakedContext();
            var drawingId   = Guid.NewGuid();
            var drawingOwner = Guid.NewGuid();
            var actingUser  = Guid.NewGuid(); // not the owner, not in any team

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState] = new OptionSetValue(StateAvailable),
                ["ownerid"]       = new EntityReference("systemuser", drawingOwner),
            };
            ctx.Initialize(new Entity[]
            {
                drawing,
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
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnCheckOutDrawing";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, actingUser);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);

            Action act = () => ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*not authorized*",
                   because: "a user who is neither the drawing owner nor an admin must be denied checkout");

            // Drawing state must remain Available — no checkout created.
            var svc = ctx.GetFakedOrganizationService();
            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
               .GetAttributeValue<OptionSetValue>(ColDrawingState).Value
               .Should().Be(StateAvailable, because: "the gate fired before any state change");

            svc.RetrieveMultiple(new QueryExpression(CheckoutEntity) { ColumnSet = new ColumnSet(false) })
               .Entities.Should().BeEmpty(because: "no checkout row must be created when the gate denies the request");
        }

        [Fact]
        public void CheckOut_sets_checkout_ownerid_to_initiating_user()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable);
            var expectedUserId = pluginCtx.InitiatingUserId;

            ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            var svc      = ctx.GetFakedOrganizationService();
            var checkouts = svc.RetrieveMultiple(new QueryExpression(CheckoutEntity)
            {
                ColumnSet = new ColumnSet("ownerid"),
            });

            checkouts.Entities[0].GetAttributeValue<EntityReference>("ownerid").Id
                .Should().Be(expectedUserId,
                    because: "the checkout ownerid must be set to the initiating user so that authorization gates work downstream");
        }

        [Fact]
        public void CheckOut_transitions_related_sheets_to_CheckedOut()
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var userId    = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState] = new OptionSetValue(StateAvailable),
                ["ownerid"]       = new EntityReference("systemuser", userId),
            };
            var sheet1  = new Entity("enmax_autocadsheet", Guid.NewGuid())
                { ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId), ["enmax_acdnstate"] = new OptionSetValue(2) };
            var sheet2  = new Entity("enmax_autocadsheet", Guid.NewGuid())
                { ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId), ["enmax_acdnstate"] = new OptionSetValue(2) };
            ctx.Initialize(new Entity[]
            {
                drawing, sheet1, sheet2,
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
                // Legacy immediate path — the gated path never touches sheets at request time.
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "RequireCheckOutApproval",
                    ["enmax_acdnvalue"] = "false",
                },
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnCheckOutDrawing";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, userId);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);

            ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            var sheets = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") });
            sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 3,
                because: "all sheets of a checked-out drawing must move to sheet CheckedOut = 3");
        }

        // -----------------------------------------------------------------------
        // WS3 — gated Check Out (RequireCheckOutApproval = true)
        // -----------------------------------------------------------------------

        [Fact]
        public void Gated_checkout_creates_a_Requested_checkout_and_leaves_drawing_Available()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable, requireApproval: true);

            ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            var svc      = ctx.GetFakedOrganizationService();
            var checkouts = svc.RetrieveMultiple(new QueryExpression(CheckoutEntity) { ColumnSet = new ColumnSet(true) });
            checkouts.Entities.Should().HaveCount(1, because: "a gated request still creates one checkout row");
            checkouts.Entities[0].GetAttributeValue<OptionSetValue>("enmax_acdnstatus").Value
                .Should().Be(StatusRequested, because: "a gated Check Out lands in Requested until an approver acts");

            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
               .GetAttributeValue<OptionSetValue>(ColDrawingState).Value
               .Should().Be(StateAvailable, because: "the drawing must NOT be checked out until the request is approved");
        }

        [Fact]
        public void Gated_checkout_does_not_move_sheets()
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var userId    = Guid.NewGuid();
            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState] = new OptionSetValue(StateAvailable),
                ["ownerid"]       = new EntityReference("systemuser", userId),
            };
            var sheet = new Entity("enmax_autocadsheet", Guid.NewGuid())
                { ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId), ["enmax_acdnstate"] = new OptionSetValue(2) };
            ctx.Initialize(new Entity[]
            {
                drawing, sheet,
                new Entity("enmax_autocadappconfig", Guid.NewGuid()) { ["enmax_acdnkey"] = "AdminTeamId",    ["enmax_acdnvalue"] = AdminTeamId.ToString() },
                new Entity("enmax_autocadappconfig", Guid.NewGuid()) { ["enmax_acdnkey"] = "ApproverTeamId", ["enmax_acdnvalue"] = ApproverTeamId.ToString() },
                new Entity("enmax_autocadappconfig", Guid.NewGuid()) { ["enmax_acdnkey"] = "RequireCheckOutApproval", ["enmax_acdnvalue"] = "true" },
            });
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnCheckOutDrawing";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, userId);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);

            ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            ctx.GetFakedOrganizationService()
               .RetrieveMultiple(new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") })
               .Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 2,
                   because: "sheets stay Available until the Check Out is approved");
        }

        [Fact]
        public void Gated_checkout_writes_a_CheckoutRequested_audit_event()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable, requireApproval: true);

            ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            var audit = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) })
                .Entities.Should().ContainSingle().Subject;
            audit.GetAttributeValue<string>("enmax_acdntostate").Should().Be("CheckoutRequested",
                because: "the gated request must be audited as a CheckoutRequested transition on the drawing");
            audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString());
        }

        [Fact]
        public void Gated_checkout_rejects_a_second_request_while_one_is_pending()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable, requireApproval: true);

            // Pre-seed a pending Requested checkout for this drawing.
            ctx.GetFakedOrganizationService().Create(new Entity(CheckoutEntity)
            {
                ["enmax_acdnstatus"]      = new OptionSetValue(StatusRequested),
                ["enmax_acdndrawing"]     = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnnewrevision"] = string.Empty,
            });

            Action act = () => ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*pending or active check-out*",
                   because: "the advisory lock must reject a duplicate Check Out request while one is outstanding");
        }
    }
}
