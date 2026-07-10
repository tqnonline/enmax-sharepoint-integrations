using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Linq;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Unit tests for ApproveCheckinPlugin.
    /// Custom API: enmax_acdnApproveCheckin (bound to enmax_autocadcheckout)
    /// </summary>
    public class ApproveCheckinPluginTests
    {
        // -----------------------------------------------------------------------
        // Constants
        // -----------------------------------------------------------------------

        private const string CheckoutEntity       = "enmax_autocadcheckout";
        private const string DrawingEntity        = "enmax_autocaddrawing";
        private const string SheetEntity          = "enmax_autocadsheet";
        private const string ColCheckoutStatus    = "enmax_acdnstatus";
        private const string ColCheckoutDrawing   = "enmax_acdndrawing";
        private const string ColCheckoutSheet     = "enmax_acdnsheet";
        private const string ColNewRevision       = "enmax_acdnnewrevision";
        private const string ColValidationReason  = "enmax_acdnvalidationreason";
        private const string ColDrawingState      = "enmax_acdnstate";
        private const string ColCurrentRevision   = "enmax_acdncurrentrevision";

        private const int StatusOpen               = 1;
        private const int StatusAwaitingValidation = 2;
        private const int StatusClosedApproved     = 3;
        private const int StateAvailable           = 1;
        private const int StateCheckedOut          = 2;
        private const int DecisionApproved         = 1;
        private const int DecisionDeclined         = 2;

        // -----------------------------------------------------------------------
        // Helpers
        // -----------------------------------------------------------------------

        private static readonly Guid ApproverTeamId = Guid.NewGuid();
        private static readonly Guid AdminTeamId     = Guid.NewGuid();

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid checkoutId, Guid drawingId)
            BuildContext(int checkoutStatus = StatusAwaitingValidation, string newRevision = "B")
        {
            var ctx        = new XrmFakedContext();
            var drawingId  = Guid.NewGuid();
            var checkoutId = Guid.NewGuid();
            var sheetId    = Guid.NewGuid();
            var userId     = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState]    = new OptionSetValue(StateCheckedOut),
                [ColCurrentRevision] = "A",
            };

            var checkout = new Entity(CheckoutEntity, checkoutId)
            {
                [ColCheckoutStatus]  = new OptionSetValue(checkoutStatus),
                [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
                [ColCheckoutSheet]   = new EntityReference(SheetEntity, sheetId),
                [ColNewRevision]     = newRevision,
            };
            var sheet = new Entity(SheetEntity, sheetId)
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(4),
            };

            // Seed authz: AppConfig + approver membership so the gate passes.
            ctx.Initialize(new[]
            {
                (Entity)drawing,
                checkout,
                sheet,
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
            pluginCtx.MessageName      = "enmax_acdnApproveCheckin";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, userId);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["Decision"] = DecisionApproved;
            pluginCtx.InputParameters["Reason"]   = string.Empty;

            return (ctx, pluginCtx, checkoutId, drawingId);
        }

        // -----------------------------------------------------------------------
        // Approve path
        // -----------------------------------------------------------------------

        [Fact]
        public void Approve_closes_checkout_and_returns_drawing_to_Available()
        {
            var (ctx, pluginCtx, checkoutId, drawingId) = BuildContext();
            pluginCtx.InputParameters["Decision"] = DecisionApproved;

            ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            var svc      = ctx.GetFakedOrganizationService();
            var checkout = svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus));
            var drawing  = svc.Retrieve(DrawingEntity,  drawingId,  new ColumnSet(ColDrawingState, ColCurrentRevision));

            checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
                    .Should().Be(StatusClosedApproved,
                        because: "approve must transition checkout to ClosedApproved");

            drawing.GetAttributeValue<OptionSetValue>(ColDrawingState).Value
                   .Should().Be(StateAvailable,
                       because: "approve must return drawing to Available so it can be checked out again");
        }

        [Fact]
        public void Approve_bumps_revision_on_drawing()
        {
            var (ctx, pluginCtx, _, drawingId) = BuildContext(newRevision: "B");
            pluginCtx.InputParameters["Decision"] = DecisionApproved;

            ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            var drawing = ctx.GetFakedOrganizationService()
                             .Retrieve(DrawingEntity, drawingId, new ColumnSet(ColCurrentRevision));

            drawing.GetAttributeValue<string>(ColCurrentRevision)
                   .Should().Be("B",
                       because: "approved revision must be written to the drawing's currentRevision field");
        }

        [Fact]
        public void Approve_returns_correct_output_parameters()
        {
            var (ctx, pluginCtx, checkoutId, _) = BuildContext();
            pluginCtx.InputParameters["Decision"] = DecisionApproved;

            ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            pluginCtx.OutputParameters["CheckoutId"].Should().Be(checkoutId.ToString());
            Convert.ToInt32(pluginCtx.OutputParameters["NewStatus"]).Should().Be(StatusClosedApproved);
            Convert.ToInt32(pluginCtx.OutputParameters["DrawingState"]).Should().Be(StateAvailable);
        }

        // -----------------------------------------------------------------------
        // Decline path
        // -----------------------------------------------------------------------

        [Fact]
        public void Decline_reverts_checkout_to_Open_and_records_reason()
        {
            var (ctx, pluginCtx, checkoutId, drawingId) = BuildContext();
            pluginCtx.InputParameters["Decision"] = DecisionDeclined;
            pluginCtx.InputParameters["Reason"]   = "Sheets are missing revisions on pages 3 and 4.";

            ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            var svc      = ctx.GetFakedOrganizationService();
            var checkout = svc.Retrieve(CheckoutEntity, checkoutId,
                new ColumnSet(ColCheckoutStatus, ColValidationReason));
            var drawing  = svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState));

            checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
                    .Should().Be(StatusOpen,
                        because: "decline must revert checkout to Open so the user can revise and resubmit");

            checkout.GetAttributeValue<string>(ColValidationReason)
                    .Should().NotBeNullOrEmpty(
                        because: "decline reason must be persisted so the requester can see why it was declined");

            drawing.GetAttributeValue<OptionSetValue>(ColDrawingState).Value
                   .Should().Be(StateCheckedOut,
                       because: "drawing must stay CheckedOut when revision is declined");
        }

        [Fact]
        public void Decline_with_short_reason_throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext();
            pluginCtx.InputParameters["Decision"] = DecisionDeclined;
            pluginCtx.InputParameters["Reason"]   = "Too short";

            Action act = () => ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*10*",
                   because: "decline reason must be at least 10 characters to prevent uninformative rejections");
        }

        [Fact]
        public void Decline_returns_correct_output_parameters()
        {
            var (ctx, pluginCtx, checkoutId, _) = BuildContext();
            pluginCtx.InputParameters["Decision"] = DecisionDeclined;
            pluginCtx.InputParameters["Reason"]   = "Missing required sheets on pages 3 and 4";

            ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            pluginCtx.OutputParameters["CheckoutId"].Should().Be(checkoutId.ToString());
            Convert.ToInt32(pluginCtx.OutputParameters["NewStatus"]).Should().Be(StatusOpen);
            Convert.ToInt32(pluginCtx.OutputParameters["DrawingState"]).Should().Be(StateCheckedOut);
        }

        // -----------------------------------------------------------------------
        // Guard / error cases
        // -----------------------------------------------------------------------

        [Fact]
        public void Non_AwaitingValidation_checkout_throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(checkoutStatus: StatusOpen);
            pluginCtx.InputParameters["Decision"] = DecisionApproved;

            Action act = () => ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage($"*{StatusOpen}*",
                   because: "cannot review a checkout that is not in AwaitingValidation; message must include the actual status");
        }

        [Fact]
        public void Invalid_decision_value_throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext();
            pluginCtx.InputParameters["Decision"] = 99;

            Action act = () => ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*99*",
                   because: "plugin must reject unknown decision values");
        }

        [Fact]
        public void Missing_Target_throws()
        {
            var ctx       = new XrmFakedContext();
            var pluginCtx = ctx.GetDefaultPluginContext();
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, Guid.NewGuid());
            pluginCtx.MessageName      = "enmax_acdnApproveCheckin";
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Decision"] = DecisionApproved;

            Action act = () => ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*Target*");
        }

        [Fact]
        public void Approve_creates_audit_event()
        {
            var (ctx, pluginCtx, checkoutId, _) = BuildContext();
            pluginCtx.InputParameters["Decision"] = DecisionApproved;

            ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            var audits = ctx.GetFakedOrganizationService()
                            .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent")
                            {
                                ColumnSet = new ColumnSet(true),
                            });

            audits.Entities.Should().HaveCount(1,
                because: "Approve must write exactly one audit event");

            audits.Entities[0].GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value
                  .Should().Be(3, because: "event type 3 = ApprovalGranted");
        }

        [Fact]
        public void Decline_creates_audit_event()
        {
            var (ctx, pluginCtx, _, _) = BuildContext();
            pluginCtx.InputParameters["Decision"] = DecisionDeclined;
            pluginCtx.InputParameters["Reason"]   = "Missing required revision marks on pages 3-5";

            ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            var audits = ctx.GetFakedOrganizationService()
                            .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent")
                            {
                                ColumnSet = new ColumnSet(true),
                            });

            audits.Entities.Should().HaveCount(1,
                because: "Decline must write exactly one audit event");

            audits.Entities[0].GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value
                  .Should().Be(4, because: "event type 4 = ApprovalDenied");
        }

        // -----------------------------------------------------------------------
        // File-centric audit, state propagation, and idempotency (plan-12)
        // -----------------------------------------------------------------------

        [Fact]
        public void Approve_audit_is_keyed_to_the_document_file()
        {
            var (ctx, pluginCtx, _, _) = BuildContext();
            var sheetId = ctx.CreateQuery(SheetEntity).Single().Id;
            pluginCtx.InputParameters["Decision"] = DecisionApproved;
            ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);
            var audit = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) })
                .Entities[0];
            audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(sheetId.ToString(),
                because: "audit must reference the exact document file");
            audit.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be(SheetEntity);
        }

        [Fact]
        public void Approve_moves_associated_document_file_to_Available()
        {
            var (ctx, pluginCtx, _, _) = BuildContext();
            pluginCtx.InputParameters["Decision"] = DecisionApproved;
            ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);
            ctx.CreateQuery(SheetEntity).Single()
                .GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value.Should().Be(2,
                    because: "an approved revision returns its document file to Available");
        }

        [Fact]
        public void Approve_does_not_change_unrelated_document_files()
        {
            var (ctx, pluginCtx, checkoutId, drawingId) = BuildContext();
            var service = ctx.GetFakedOrganizationService();
            var associatedSheetId = service.Retrieve(
                    CheckoutEntity,
                    checkoutId,
                    new ColumnSet(ColCheckoutSheet))
                .GetAttributeValue<EntityReference>(ColCheckoutSheet).Id;
            var unrelatedSheetId = service.Create(new Entity(SheetEntity)
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(4),
            });

            pluginCtx.InputParameters["Decision"] = DecisionApproved;
            ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            service.Retrieve(SheetEntity, associatedSheetId, new ColumnSet("enmax_acdnstate"))
                .GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value.Should().Be(2);
            service.Retrieve(SheetEntity, unrelatedSheetId, new ColumnSet("enmax_acdnstate"))
                .GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value.Should().Be(4,
                    because: "approval changes only the document file associated with the checkout");
        }

        [Fact]
        public void Decline_moves_associated_document_file_back_to_CheckedOut()
        {
            var (ctx, pluginCtx, _, _) = BuildContext();
            pluginCtx.InputParameters["Decision"] = DecisionDeclined;
            pluginCtx.InputParameters["Reason"]   = "Missing revision marks on pages 3 and 4.";
            ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);
            ctx.CreateQuery(SheetEntity).Single()
                .GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value.Should().Be(3,
                    because: "a declined revision returns its document file to CheckedOut");
        }

        [Fact]
        public void Already_ClosedApproved_checkout_is_idempotent_noop()
        {
            var (ctx, pluginCtx, checkoutId, _) = BuildContext(checkoutStatus: StatusClosedApproved);
            pluginCtx.InputParameters["Decision"] = DecisionApproved;
            Action act = () => ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);
            act.Should().NotThrow(because: "re-approving an already-approved checkout must be a silent success (idempotent)");
            var checkout = ctx.GetFakedOrganizationService()
                .Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus));
            checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value.Should().Be(StatusClosedApproved);
        }

        [Fact]
        public void UnauthorizedUser_cannot_validate_checkin_and_state_unchanged()
        {
            // Arrange: a plain user (not in any team) tries to approve a checkout
            var ctx        = new XrmFakedContext();
            var drawingId  = Guid.NewGuid();
            var checkoutId = Guid.NewGuid();
            var plainUser  = Guid.NewGuid();

            ctx.Initialize(new[]
            {
                new Entity(DrawingEntity, drawingId)
                {
                    [ColDrawingState]    = new OptionSetValue(StateCheckedOut),
                    [ColCurrentRevision] = "A",
                },
                new Entity(CheckoutEntity, checkoutId)
                {
                    [ColCheckoutStatus]  = new OptionSetValue(StatusAwaitingValidation),
                    [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
                    [ColNewRevision]     = "B",
                },
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
                // No teammembership for plainUser
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnApproveCheckin";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, plainUser);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"]   = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["Decision"] = DecisionApproved;

            Action act = () => ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*not authorized*",
                   because: "a user outside the Admin/Approver teams must be denied");

            var unchanged = ctx.GetFakedOrganizationService()
                               .Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus));
            unchanged.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value
                     .Should().Be(StatusAwaitingValidation,
                         because: "authorization failure must leave the checkout status unchanged (no partial write)");
        }
    }
}
