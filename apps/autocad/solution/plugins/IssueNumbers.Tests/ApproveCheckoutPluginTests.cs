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
    /// Unit tests for ApproveCheckoutPlugin (WS3 gated Check Out).
    /// Custom API: enmax_acdnApproveCheckout (bound to enmax_autocadcheckout)
    /// </summary>
    public class ApproveCheckoutPluginTests
    {
        private const string CheckoutEntity     = "enmax_autocadcheckout";
        private const string DrawingEntity      = "enmax_autocaddrawing";
        private const string SheetEntity        = "enmax_autocadsheet";
        private const string ColCheckoutStatus  = "enmax_acdnstatus";
        private const string ColCheckoutDrawing = "enmax_acdndrawing";
        private const string ColDrawingState    = "enmax_acdnstate";

        private const int StatusOpen           = 1;
        private const int StatusClosedDeclined = 4;
        private const int StatusRequested      = 6;

        private const int StateAvailable  = 1;
        private const int StateCheckedOut = 2;

        private const int DecisionApproved = 1;
        private const int DecisionDeclined = 2;

        private const string ValidDeclineReason = "Not authorized for this vendor package right now.";

        private static readonly Guid AdminTeamId    = Guid.NewGuid();
        private static readonly Guid ApproverTeamId = Guid.NewGuid();

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid checkoutId, Guid drawingId, Guid requester)
            BuildContext(int checkoutStatus = StatusRequested, bool actorIsApprover = true)
        {
            return BuildContextWithSheet(checkoutStatus, actorIsApprover, out _, out _, out _, out _);
        }

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid checkoutId, Guid drawingId, Guid requester)
            BuildContextWithSheet(
                int checkoutStatus,
                bool actorIsApprover,
                out Guid sheetId,
                out Guid checkoutId,
                out Guid drawingId,
                out Guid requester)
        {
            var ctx        = new XrmFakedContext();
            drawingId  = Guid.NewGuid();
            checkoutId = Guid.NewGuid();
            var actingUser = Guid.NewGuid();
            requester  = Guid.NewGuid();
            sheetId    = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState] = new OptionSetValue(StateAvailable),
            };
            var checkout = new Entity(CheckoutEntity, checkoutId)
            {
                [ColCheckoutStatus]  = new OptionSetValue(checkoutStatus),
                [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnsheet"]  = new EntityReference(SheetEntity, sheetId),
                ["ownerid"]          = new EntityReference("systemuser", requester),
            };
            var sheet = new Entity(SheetEntity, sheetId)
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(2),
            };

            var seed = new System.Collections.Generic.List<Entity>
            {
                drawing, checkout, sheet,
                new Entity("enmax_autocadappconfig", Guid.NewGuid()) { ["enmax_acdnkey"] = "AdminTeamId",    ["enmax_acdnvalue"] = AdminTeamId.ToString() },
                new Entity("enmax_autocadappconfig", Guid.NewGuid()) { ["enmax_acdnkey"] = "ApproverTeamId", ["enmax_acdnvalue"] = ApproverTeamId.ToString() },
            };
            if (actorIsApprover)
                seed.Add(new Entity("teammembership", Guid.NewGuid()) { ["teamid"] = ApproverTeamId, ["systemuserid"] = actingUser });
            ctx.Initialize(seed);

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnApproveCheckout";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = actingUser;
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"]   = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["Decision"] = DecisionApproved;

            return (ctx, pluginCtx, checkoutId, drawingId, requester);
        }

        [Fact]
        public void Approve_moves_checkout_to_Open_and_drawing_to_CheckedOut()
        {
            var (ctx, pluginCtx, checkoutId, drawingId, _) = BuildContext();

            ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx);

            var svc      = ctx.GetFakedOrganizationService();
            svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus))
               .GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
               .Should().Be(StatusOpen, because: "approving a Check Out request opens the checkout");
            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
               .GetAttributeValue<OptionSetValue>(ColDrawingState).Value
               .Should().Be(StateCheckedOut, because: "only on approval does the drawing actually become CheckedOut");
        }

        [Fact]
        public void Approve_moves_sheets_to_CheckedOut()
        {
            var (ctx, pluginCtx, _, _, _) = BuildContext();
            ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx);
            ctx.GetFakedOrganizationService()
               .RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_acdnstate") })
               .Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 3,
                   because: "approved Check Out propagates sheets to CheckedOut = 3");
        }

        [Fact]
        public void Approve_returns_output_parameters()
        {
            var (ctx, pluginCtx, checkoutId, _, _) = BuildContext();
            ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx);
            pluginCtx.OutputParameters["CheckoutId"].Should().Be(checkoutId.ToString());
            Convert.ToInt32(pluginCtx.OutputParameters["NewStatus"]).Should().Be(StatusOpen);
            Convert.ToInt32(pluginCtx.OutputParameters["DrawingState"]).Should().Be(StateCheckedOut);
        }

        [Fact]
        public void Approve_writes_ApprovalGranted_audit_keyed_to_drawing()
        {
            var (ctx, pluginCtx, _, drawingId, _) = BuildContext();
            ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx);
            var audit = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) })
                .Entities.Should().ContainSingle().Subject;
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(3, because: "event 3 = Approval Granted");
            audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString(),
                because: "the audit must appear on the drawing timeline");
        }

        [Fact]
        public void Decline_closes_checkout_and_leaves_drawing_Available()
        {
            var (ctx, pluginCtx, checkoutId, drawingId, _) = BuildContext();
            pluginCtx.InputParameters["Decision"] = DecisionDeclined;
            pluginCtx.InputParameters["Reason"]   = ValidDeclineReason;

            ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx);

            var svc = ctx.GetFakedOrganizationService();
            svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus, "enmax_acdnvalidationreason"))
               .GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
               .Should().Be(StatusClosedDeclined, because: "a declined Check Out request is closed as ClosedDeclined");
            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
               .GetAttributeValue<OptionSetValue>(ColDrawingState).Value
               .Should().Be(StateAvailable, because: "the drawing was never moved, so a decline leaves it Available");
        }

        [Fact]
        public void Approve_second_sheet_in_batch_succeeds_when_drawing_already_CheckedOut()
        {
            var ctx = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var actingUser = Guid.NewGuid();
            var sheet1Id = Guid.NewGuid();
            var sheet2Id = Guid.NewGuid();
            var checkout1Id = Guid.NewGuid();
            var checkout2Id = Guid.NewGuid();

            ctx.Initialize(new System.Collections.Generic.List<Entity>
            {
                new Entity(DrawingEntity, drawingId) { [ColDrawingState] = new OptionSetValue(StateAvailable) },
                new Entity(SheetEntity, sheet1Id)
                {
                    ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                    ["enmax_acdnstate"]   = new OptionSetValue(2),
                },
                new Entity(SheetEntity, sheet2Id)
                {
                    ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                    ["enmax_acdnstate"]   = new OptionSetValue(2),
                },
                new Entity(CheckoutEntity, checkout1Id)
                {
                    [ColCheckoutStatus]  = new OptionSetValue(StatusRequested),
                    [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
                    ["enmax_acdnsheet"]  = new EntityReference(SheetEntity, sheet1Id),
                },
                new Entity(CheckoutEntity, checkout2Id)
                {
                    [ColCheckoutStatus]  = new OptionSetValue(StatusRequested),
                    [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
                    ["enmax_acdnsheet"]  = new EntityReference(SheetEntity, sheet2Id),
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid()) { ["enmax_acdnkey"] = "AdminTeamId",    ["enmax_acdnvalue"] = AdminTeamId.ToString() },
                new Entity("enmax_autocadappconfig", Guid.NewGuid()) { ["enmax_acdnkey"] = "ApproverTeamId", ["enmax_acdnvalue"] = ApproverTeamId.ToString() },
                new Entity("teammembership", Guid.NewGuid()) { ["teamid"] = ApproverTeamId, ["systemuserid"] = actingUser },
            });

            var pluginCtx1 = ctx.GetDefaultPluginContext();
            pluginCtx1.MessageName = "enmax_acdnApproveCheckout";
            pluginCtx1.Stage = 40;
            pluginCtx1.InitiatingUserId = actingUser;
            pluginCtx1.InputParameters = new ParameterCollection
            {
                ["Target"] = new EntityReference(CheckoutEntity, checkout1Id),
                ["Decision"] = DecisionApproved,
            };
            pluginCtx1.OutputParameters = new ParameterCollection();
            ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx1);

            var pluginCtx2 = ctx.GetDefaultPluginContext();
            pluginCtx2.MessageName = "enmax_acdnApproveCheckout";
            pluginCtx2.Stage = 40;
            pluginCtx2.InitiatingUserId = actingUser;
            pluginCtx2.InputParameters = new ParameterCollection
            {
                ["Target"] = new EntityReference(CheckoutEntity, checkout2Id),
                ["Decision"] = DecisionApproved,
            };
            pluginCtx2.OutputParameters = new ParameterCollection();

            Action act = () => ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx2);
            act.Should().NotThrow(because: "subsequent sheets in a batch share an already-CheckedOut drawing");

            var svc = ctx.GetFakedOrganizationService();
            svc.Retrieve(CheckoutEntity, checkout2Id, new ColumnSet(ColCheckoutStatus))
               .GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
               .Should().Be(StatusOpen);
            svc.Retrieve(SheetEntity, sheet2Id, new ColumnSet("enmax_acdnstate"))
               .GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value
               .Should().Be(3);
        }

        [Fact]
        public void Decline_without_a_sufficient_reason_throws()
        {
            var (ctx, pluginCtx, _, _, _) = BuildContext();
            pluginCtx.InputParameters["Decision"] = DecisionDeclined;
            pluginCtx.InputParameters["Reason"]   = "too short";
            Action act = () => ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*10 characters*",
                because: "declining must record a meaningful reason (10+ chars)");
        }

        [Fact]
        public void Already_Open_checkout_is_an_idempotent_no_op()
        {
            var (ctx, pluginCtx, checkoutId, _, _) = BuildContext(checkoutStatus: StatusOpen);
            Action act = () => ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx);
            act.Should().NotThrow(because: "re-approving an already-approved (Open) checkout must be idempotent");
            ctx.GetFakedOrganizationService()
               .Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus))
               .GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value.Should().Be(StatusOpen);
        }

        [Fact]
        public void Non_requested_status_throws()
        {
            var (ctx, pluginCtx, _, _, _) = BuildContext(checkoutStatus: StatusClosedDeclined);
            Action act = () => ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage($"*{StatusRequested}*",
                because: "only a Requested checkout can be approved/declined");
        }

        [Fact]
        public void Non_approver_non_admin_cannot_approve_checkout()
        {
            var (ctx, pluginCtx, checkoutId, drawingId, _) = BuildContext(actorIsApprover: false);

            Action act = () => ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*not authorized*",
                because: "only approvers and admins may approve a Check Out request");

            var svc = ctx.GetFakedOrganizationService();
            svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus))
               .GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
               .Should().Be(StatusRequested, because: "the gate fires before any state change");
            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
               .GetAttributeValue<OptionSetValue>(ColDrawingState).Value
               .Should().Be(StateAvailable, because: "no drawing transition when the gate denies the request");
        }

        [Fact]
        public void Missing_Decision_throws()
        {
            var (ctx, pluginCtx, _, _, _) = BuildContext();
            pluginCtx.InputParameters.Remove("Decision");
            Action act = () => ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*Decision*");
        }

        [Fact]
        public void Wrong_entity_type_throws()
        {
            var ctx       = new XrmFakedContext();
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnApproveCheckout";
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference("account", Guid.NewGuid());
            Action act = () => ctx.ExecutePluginWith<ApproveCheckoutPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage($"*{CheckoutEntity}*");
        }
    }
}
