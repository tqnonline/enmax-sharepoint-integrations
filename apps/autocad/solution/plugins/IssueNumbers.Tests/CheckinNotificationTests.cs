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
    /// Check-in notification (flow-free): when a revision is submitted and approval is required, the
    /// SubmitRevision plug-in must notify every Approver/Admin team member (except the submitter).
    /// </summary>
    public class CheckinNotificationTests
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string CheckoutEntity  = "enmax_autocadcheckout";
        private const string SheetEntity     = "enmax_autocadsheet";
        private const string AppConfigEntity = "enmax_autocadappconfig";
        private const string NotifEntity     = "enmax_autocadinappnotification";
        private const string MembershipEntity = "teammembership";

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx,
                        Guid submitter, Guid adminUser, Guid approverUser, Guid checkoutId)
            Build(bool requireApproval)
        {
            var ctx          = new XrmFakedContext();
            var drawingId    = Guid.NewGuid();
            var checkoutId   = Guid.NewGuid();
            var submitter    = Guid.NewGuid();
            var adminUser    = Guid.NewGuid();
            var approverUser = Guid.NewGuid();
            var adminTeam    = Guid.NewGuid();
            var approverTeam = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                ["enmax_acdnstate"]           = new OptionSetValue(2), // CheckedOut
                ["enmax_acdncurrentrevision"] = "A",
                ["enmax_acdnnumber"]          = "GG-CG-00-0042",
            };
            var checkout = new Entity(CheckoutEntity, checkoutId)
            {
                ["enmax_acdnstatus"]  = new OptionSetValue(1), // Open
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                // Owner = submitter so RequireSelf gate passes for the submitter.
                ["ownerid"]           = new EntityReference("systemuser", submitter),
            };
            var sheet = new Entity(SheetEntity, Guid.NewGuid())
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(3),
            };

            var cfgApproval = Config("RequireCheckInApproval", requireApproval ? "true" : "false");
            var cfgAdmin    = Config("AdminTeamId", adminTeam.ToString());
            var cfgApprover = Config("ApproverTeamId", approverTeam.ToString());

            // adminUser ∈ Admin team; approverUser AND submitter ∈ Approver team (submitter must be excluded).
            var mAdmin     = Membership(adminTeam, adminUser);
            var mApprover  = Membership(approverTeam, approverUser);
            var mSubmitter = Membership(approverTeam, submitter);
            var submitterUser = new Entity("systemuser", submitter) { ["fullname"] = "Pat Submitter" };

            ctx.Initialize(new[]
            {
                drawing, checkout, sheet, cfgApproval, cfgAdmin, cfgApprover,
                mAdmin, mApprover, mSubmitter, submitterUser,
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnSubmitRevision";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, submitter);
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"]         = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["SubmissionInfo"] = "Project Falcon, WO#12345";

            return (ctx, pluginCtx, submitter, adminUser, approverUser, checkoutId);
        }

        private static Entity Config(string key, string value) =>
            new Entity(AppConfigEntity, Guid.NewGuid()) { ["enmax_acdnkey"] = key, ["enmax_acdnvalue"] = value };

        private static Entity Membership(Guid teamId, Guid userId) =>
            new Entity(MembershipEntity, Guid.NewGuid()) { ["teamid"] = teamId, ["systemuserid"] = userId };

        private static System.Collections.Generic.IList<Entity> Notifications(XrmFakedContext ctx) =>
            ctx.GetFakedOrganizationService()
               .RetrieveMultiple(new QueryExpression(NotifEntity) { ColumnSet = new ColumnSet(true) }).Entities;

        [Fact]
        public void Approval_on_notifies_admins_and_approvers_except_the_submitter()
        {
            var (ctx, pluginCtx, _, adminUser, approverUser, checkoutId) = Build(requireApproval: true);

            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            var notifs = Notifications(ctx);
            notifs.Select(n => n.GetAttributeValue<EntityReference>("enmax_acdnrecipient").Id)
                .Should().BeEquivalentTo(new[] { adminUser, approverUser },
                    because: "every Admin/Approver is notified, but the submitter (also an approver) is not told about their own check-in");
            notifs.Should().OnlyContain(n =>
                n.GetAttributeValue<string>("enmax_acdnsubjectid") == checkoutId.ToString() &&
                n.GetAttributeValue<string>("enmax_acdndeeplinkpath") == "/approvals?tab=checkins",
                because: "the notification deep-links to the check-in validation queue");
        }

        [Fact]
        public void Notification_body_names_the_submitter_and_drawing()
        {
            var (ctx, pluginCtx, _, _, _, _) = Build(requireApproval: true);

            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            var body = Notifications(ctx).First().GetAttributeValue<string>("enmax_acdnbody");
            body.Should().Contain("Pat Submitter").And.Contain("GG-CG-00-0042");
            Notifications(ctx).First().GetAttributeValue<OptionSetValue>("enmax_acdnseverity").Value
                .Should().Be(2, because: "a pending validation is a Warning-severity nudge, not Critical");
        }

        [Fact]
        public void Approval_off_still_notifies_admins_and_approvers_to_move_the_files()
        {
            var (ctx, pluginCtx, _, adminUser, approverUser, _) = Build(requireApproval: false);

            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            var notifs = Notifications(ctx);
            notifs.Select(n => n.GetAttributeValue<EntityReference>("enmax_acdnrecipient").Id)
                .Should().BeEquivalentTo(new[] { adminUser, approverUser },
                    because: "a check-in always notifies admins/approvers — even with approval off they must move the files");
            notifs.First().GetAttributeValue<string>("enmax_acdnbody").Should().Contain("move",
                because: "with approval off there is nothing to validate; the nudge is to move the files to SharePoint");
        }
    }
}
