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
    public class SubmitRevisionPluginTests
    {
        private const string CheckoutEntity      = "enmax_autocadcheckout";
        private const string DrawingEntity       = "enmax_autocaddrawing";
        private const string SheetEntity         = "enmax_autocadsheet";
        private const string AppConfigEntity     = "enmax_autocadappconfig";
        private const string ColCheckoutStatus   = "enmax_acdnstatus";
        private const string ColCheckoutDrawing  = "enmax_acdndrawing";
        private const string ColNewRevision      = "enmax_acdnnewrevision";
        private const string ColDrawingState     = "enmax_acdnstate";
        private const string ColCurrentRevision  = "enmax_acdncurrentrevision";

        private const int StatusOpen               = 1;
        private const int StatusAwaitingValidation = 2;
        private const int StatusClosedApproved     = 3;
        private const int StateAvailable           = 1;
        private const int StateCheckedOut          = 2;
        private const int StateAwaitingValidation  = 3;

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid checkoutId, Guid drawingId)
            BuildContext(bool requireApproval, int checkoutStatus = StatusOpen, int drawingState = StateCheckedOut)
        {
            var ctx        = new XrmFakedContext();
            var drawingId  = Guid.NewGuid();
            var checkoutId = Guid.NewGuid();
            var userId     = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState]    = new OptionSetValue(drawingState),
                [ColCurrentRevision] = "A",
            };
            var checkout = new Entity(CheckoutEntity, checkoutId)
            {
                [ColCheckoutStatus]  = new OptionSetValue(checkoutStatus),
                [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
                // Owner = acting user so RequireSelf gate passes.
                ["ownerid"]          = new EntityReference("systemuser", userId),
            };
            var sheet = new Entity(SheetEntity, Guid.NewGuid())
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(3),
            };
            var config = new Entity(AppConfigEntity, Guid.NewGuid())
            {
                ["enmax_acdnkey"]   = "RequireCheckInApproval",
                ["enmax_acdnvalue"] = requireApproval ? "true" : "false",
            };
            ctx.Initialize(new Entity[] { drawing, checkout, sheet, config });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnSubmitRevision";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, userId);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"]         = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["SubmissionInfo"] = "Project Falcon, WO#12345";

            return (ctx, pluginCtx, checkoutId, drawingId);
        }

        [Fact]
        public void Approval_off_closes_checkout_and_returns_drawing_to_Available_with_bumped_revision()
        {
            var (ctx, pluginCtx, checkoutId, drawingId) = BuildContext(requireApproval: false);
            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);
            var svc      = ctx.GetFakedOrganizationService();
            var checkout = svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus));
            var drawing  = svc.Retrieve(DrawingEntity,  drawingId,  new ColumnSet(ColDrawingState, ColCurrentRevision));
            checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value.Should().Be(StatusClosedApproved,
                because: "with approval OFF, submitting a revision closes the checkout immediately");
            drawing.GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StateAvailable,
                because: "approval-off submit returns the drawing to Available");
            drawing.GetAttributeValue<string>(ColCurrentRevision).Should().NotBeNullOrEmpty(
                because: "WS3: the revision number is gone, but an internal cycle token is stamped so 'has been checked in' gating still works");
        }

        [Fact]
        public void SubmissionInfo_is_persisted_on_the_checkout()
        {
            var (ctx, pluginCtx, checkoutId, _) = BuildContext(requireApproval: false);
            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);
            var checkout = ctx.GetFakedOrganizationService()
                .Retrieve(CheckoutEntity, checkoutId, new ColumnSet("enmax_acdnsubmissioninfo"));
            checkout.GetAttributeValue<string>("enmax_acdnsubmissioninfo").Should().Be("Project Falcon, WO#12345",
                because: "the mandatory Submission Information must be recorded on the checkout for traceability/audit");
        }

        [Fact]
        public void Approval_off_moves_sheets_to_Available()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(requireApproval: false);
            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);
            var sheets = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_acdnstate") });
            sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 2,
                because: "approval-off submit returns sheets to sheet Available = 2");
        }

        [Fact]
        public void Missing_config_defaults_to_requiring_approval()
        {
            // No RequireCheckInApproval row seeded → default must be ON (gated), not auto-close.
            var ctx        = new XrmFakedContext();
            var drawingId  = Guid.NewGuid();
            var checkoutId = Guid.NewGuid();
            var userId     = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState]    = new OptionSetValue(StateCheckedOut),
                [ColCurrentRevision] = "A",
            };
            var checkout = new Entity(CheckoutEntity, checkoutId)
            {
                [ColCheckoutStatus]  = new OptionSetValue(StatusOpen),
                [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
                ["ownerid"]          = new EntityReference("systemuser", userId),
            };
            ctx.Initialize(new Entity[] { drawing, checkout });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnSubmitRevision";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, userId);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"]         = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["SubmissionInfo"] = "Project Falcon, WO#12345";

            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            var svc = ctx.GetFakedOrganizationService();
            svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus))
               .GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
               .Should().Be(StatusAwaitingValidation,
                   because: "with no config row, check-ins default to requiring approval");
            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
               .GetAttributeValue<OptionSetValue>(ColDrawingState).Value
               .Should().Be(StateAwaitingValidation,
                   because: "the drawing must wait for validation rather than auto-returning to Available");
        }

        [Fact]
        public void Approval_on_sets_checkout_and_drawing_to_AwaitingValidation()
        {
            var (ctx, pluginCtx, checkoutId, drawingId) = BuildContext(requireApproval: true);
            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);
            var svc      = ctx.GetFakedOrganizationService();
            var checkout = svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus, ColNewRevision));
            var drawing  = svc.Retrieve(DrawingEntity,  drawingId,  new ColumnSet(ColDrawingState));
            checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value.Should().Be(StatusAwaitingValidation,
                because: "with approval ON, the checkout waits for an approver");
            checkout.GetAttributeValue<string>(ColNewRevision).Should().NotBeNullOrEmpty(
                because: "an internal cycle token is stored on the checkout to keep the (Drawing + NewRevision + Status) alt key unique across cycles");
            drawing.GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StateAwaitingValidation,
                because: "approval-on submit moves the drawing to AwaitingValidation");
        }

        [Fact]
        public void Approval_on_moves_sheets_to_AwaitingValidation()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(requireApproval: true);
            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);
            var sheets = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_acdnstate") });
            sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 4,
                because: "approval-on submit moves sheets to sheet AwaitingValidation = 4");
        }

        [Fact]
        public void Audit_is_keyed_to_the_drawing_not_the_checkout()
        {
            var (ctx, pluginCtx, _, drawingId) = BuildContext(requireApproval: false);
            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);
            var audits = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) });
            audits.Entities.Should().HaveCount(1, because: "exactly one State Changed audit per submit");
            var a = audits.Entities[0];
            a.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(2, because: "event 2 = State Changed");
            a.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString(),
                because: "audit must be keyed to the drawing so the drawing timeline shows it");
            a.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be(DrawingEntity);
        }

        [Fact]
        public void Missing_SubmissionInfo_throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(requireApproval: false);
            pluginCtx.InputParameters["SubmissionInfo"] = string.Empty;
            Action act = () => ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*SubmissionInfo*",
                because: "WS3: Submission Information (Project, WO#, ...) is mandatory at Check In");
        }

        [Fact]
        public void Checkout_not_Open_throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(requireApproval: false, checkoutStatus: StatusClosedApproved);
            Action act = () => ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage($"*{StatusClosedApproved}*",
                because: "you can only submit a revision against an Open checkout");
        }

        [Fact]
        public void ConcurrencyVersionMismatch_on_drawing_update_propagates_to_caller()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(requireApproval: false);
            var fault = new OrganizationServiceFault { ErrorCode = -2147088254, Message = "ConcurrencyVersionMismatch" };
            ctx.AddFakeMessageExecutor<UpdateRequest>(
                new AlwaysThrowUpdateExecutor(new FaultException<OrganizationServiceFault>(fault, fault.Message)));

            Action act = () => ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*ConcurrencyVersionMismatch*",
                because: "two simultaneous revision submits must not both win; the loser must be told to retry (Rule 14)");
        }

        [Fact]
        public void Non_checkout_owner_cannot_submit_revision()
        {
            // Arrange: checkout owned by someone else; acting user is a stranger.
            var ctx          = new XrmFakedContext();
            var drawingId    = Guid.NewGuid();
            var checkoutId   = Guid.NewGuid();
            var checkoutOwner = Guid.NewGuid();
            var actingUser   = Guid.NewGuid(); // not the owner

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState]    = new OptionSetValue(StateCheckedOut),
                [ColCurrentRevision] = "A",
            };
            var checkout = new Entity(CheckoutEntity, checkoutId)
            {
                [ColCheckoutStatus]  = new OptionSetValue(StatusOpen),
                [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
                ["ownerid"]          = new EntityReference("systemuser", checkoutOwner),
            };
            var config = new Entity(AppConfigEntity, Guid.NewGuid())
            {
                ["enmax_acdnkey"]   = "RequireCheckInApproval",
                ["enmax_acdnvalue"] = "false",
            };
            ctx.Initialize(new Entity[] { drawing, checkout, config });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnSubmitRevision";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, actingUser);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"]         = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["SubmissionInfo"] = "Project Falcon, WO#12345";

            Action act = () => ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*not authorized*",
                   because: "only the checkout owner may submit a revision; other users must be denied");

            // Checkout and drawing state must remain unchanged.
            var svc = ctx.GetFakedOrganizationService();
            svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus))
               .GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
               .Should().Be(StatusOpen, because: "the gate fires before any state change");
        }
    }
}
