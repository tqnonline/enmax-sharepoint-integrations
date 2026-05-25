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
            pluginCtx.InitiatingUserId = userId;
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"]      = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["NewRevision"]  = "B";
            pluginCtx.InputParameters["Reason"]       = string.Empty;

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
            drawing.GetAttributeValue<string>(ColCurrentRevision).Should().Be("B",
                because: "the new revision must be stamped on the drawing");
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
        public void Approval_on_sets_checkout_and_drawing_to_AwaitingValidation()
        {
            var (ctx, pluginCtx, checkoutId, drawingId) = BuildContext(requireApproval: true);
            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);
            var svc      = ctx.GetFakedOrganizationService();
            var checkout = svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus, ColNewRevision));
            var drawing  = svc.Retrieve(DrawingEntity,  drawingId,  new ColumnSet(ColDrawingState));
            checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value.Should().Be(StatusAwaitingValidation,
                because: "with approval ON, the checkout waits for an approver");
            checkout.GetAttributeValue<string>(ColNewRevision).Should().Be("B",
                because: "the proposed revision is stored on the checkout until approved");
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
        public void Missing_NewRevision_throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(requireApproval: false);
            pluginCtx.InputParameters["NewRevision"] = string.Empty;
            Action act = () => ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*NewRevision*",
                because: "a revision identifier is mandatory");
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
    }
}
