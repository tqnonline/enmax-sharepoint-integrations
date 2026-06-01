using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Full-lifecycle in-app notifications (flow-free): user → approver/admin → user back.
    /// Each transition writes an enmax_autocadinappnotification to the right recipient.
    /// </summary>
    public class LifecycleNotificationTests
    {
        private const string ReservationEntity = "enmax_autocadreservation";
        private const string CheckoutEntity    = "enmax_autocadcheckout";
        private const string DrawingEntity     = "enmax_autocaddrawing";
        private const string NotifEntity       = "enmax_autocadinappnotification";

        private static IList<Entity> Notifications(XrmFakedContext ctx) =>
            ctx.GetFakedOrganizationService()
               .RetrieveMultiple(new QueryExpression(NotifEntity) { ColumnSet = new ColumnSet(true) }).Entities;

        private static Entity OnlyNotification(XrmFakedContext ctx)
        {
            var n = Notifications(ctx);
            n.Should().ContainSingle("exactly one recipient should be notified");
            return n[0];
        }

        private static XrmFakedPluginExecutionContext Ctx(XrmFakedContext ctx, string message, Guid actor)
        {
            var p = ctx.GetDefaultPluginContext();
            p.MessageName      = message;
            p.Stage            = 40;
            p.InitiatingUserId = actor;
            p.InputParameters  = new ParameterCollection();
            p.OutputParameters = new ParameterCollection();
            return p;
        }

        // ── Reservation: approved / declined → requester ──────────────────────

        [Fact]
        public void ApproveReservation_notifies_the_requester()
        {
            var ctx = new XrmFakedContext();
            var resId = Guid.NewGuid(); var requester = Guid.NewGuid(); var approver = Guid.NewGuid();
            ctx.Initialize(new[] { new Entity(ReservationEntity, resId)
            {
                ["enmax_acdnstatus"] = new OptionSetValue(1),
                ["ownerid"] = new EntityReference("systemuser", requester),
                ["enmax_acdnreservationnumber"] = "RES-0042",
            } });
            var p = Ctx(ctx, "enmax_acdnApproveReservation", approver);
            p.InputParameters["Target"] = new EntityReference(ReservationEntity, resId);

            ctx.ExecutePluginWith<ApproveReservationPlugin>(p);

            var n = OnlyNotification(ctx);
            n.GetAttributeValue<EntityReference>("enmax_acdnrecipient").Id.Should().Be(requester);
            n.GetAttributeValue<OptionSetValue>("enmax_acdnsourceevent").Value.Should().Be(1, "Reservation Approved");
            n.GetAttributeValue<string>("enmax_acdndeeplinkpath").Should().Be($"/reservations/{resId}");
            n.GetAttributeValue<string>("enmax_acdnbody").Should().Contain("RES-0042");
        }

        [Fact]
        public void DeclineReservation_notifies_the_requester_with_reason()
        {
            var ctx = new XrmFakedContext();
            var resId = Guid.NewGuid(); var requester = Guid.NewGuid(); var approver = Guid.NewGuid();
            ctx.Initialize(new[] { new Entity(ReservationEntity, resId)
            {
                ["enmax_acdnstatus"] = new OptionSetValue(1),
                ["ownerid"] = new EntityReference("systemuser", requester),
                ["enmax_acdnreservationnumber"] = "RES-0043",
            } });
            var p = Ctx(ctx, "enmax_acdnDeclineReservation", approver);
            p.InputParameters["Target"] = new EntityReference(ReservationEntity, resId);
            p.InputParameters["Reason"] = "Duplicate of an existing reservation";

            ctx.ExecutePluginWith<DeclineReservationPlugin>(p);

            var n = OnlyNotification(ctx);
            n.GetAttributeValue<EntityReference>("enmax_acdnrecipient").Id.Should().Be(requester);
            n.GetAttributeValue<OptionSetValue>("enmax_acdnsourceevent").Value.Should().Be(2, "Reservation Declined");
            n.GetAttributeValue<string>("enmax_acdnbody").Should().Contain("Duplicate of an existing reservation");
        }

        // ── Check-in: validated / declined → submitter ────────────────────────

        private static XrmFakedContext CheckinCtx(Guid checkoutId, Guid drawingId, Guid submitter, int checkoutStatus)
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity(CheckoutEntity, checkoutId)
                {
                    ["enmax_acdnstatus"]      = new OptionSetValue(checkoutStatus),
                    ["enmax_acdndrawing"]     = new EntityReference(DrawingEntity, drawingId),
                    ["enmax_acdnnewrevision"] = "B",
                    ["ownerid"]               = new EntityReference("systemuser", submitter),
                },
                new Entity(DrawingEntity, drawingId)
                {
                    ["enmax_acdnstate"]  = new OptionSetValue(checkoutStatus == 2 ? 3 : 2),
                    ["enmax_acdnnumber"] = "GG-CG-00-0007",
                },
            });
            return ctx;
        }

        [Fact]
        public void ApproveCheckin_validated_notifies_the_submitter()
        {
            var checkoutId = Guid.NewGuid(); var drawingId = Guid.NewGuid();
            var submitter = Guid.NewGuid(); var approver = Guid.NewGuid();
            var ctx = CheckinCtx(checkoutId, drawingId, submitter, checkoutStatus: 2);
            var p = Ctx(ctx, "enmax_acdnApproveCheckin", approver);
            p.InputParameters["Target"]   = new EntityReference(CheckoutEntity, checkoutId);
            p.InputParameters["Decision"] = 1; // Approved

            ctx.ExecutePluginWith<ApproveCheckinPlugin>(p);

            var n = OnlyNotification(ctx);
            n.GetAttributeValue<EntityReference>("enmax_acdnrecipient").Id.Should().Be(submitter);
            n.GetAttributeValue<OptionSetValue>("enmax_acdnsourceevent").Value.Should().Be(3, "Check In Validated");
            n.GetAttributeValue<string>("enmax_acdndeeplinkpath").Should().Be("/my-items?tab=checkouts");
        }

        [Fact]
        public void ApproveCheckin_declined_notifies_the_submitter_with_reason()
        {
            var checkoutId = Guid.NewGuid(); var drawingId = Guid.NewGuid();
            var submitter = Guid.NewGuid(); var approver = Guid.NewGuid();
            var ctx = CheckinCtx(checkoutId, drawingId, submitter, checkoutStatus: 2);
            var p = Ctx(ctx, "enmax_acdnApproveCheckin", approver);
            p.InputParameters["Target"]   = new EntityReference(CheckoutEntity, checkoutId);
            p.InputParameters["Decision"] = 2; // Declined
            p.InputParameters["Reason"]   = "Title block is missing the revision date";

            ctx.ExecutePluginWith<ApproveCheckinPlugin>(p);

            var n = OnlyNotification(ctx);
            n.GetAttributeValue<EntityReference>("enmax_acdnrecipient").Id.Should().Be(submitter);
            n.GetAttributeValue<OptionSetValue>("enmax_acdnsourceevent").Value.Should().Be(4, "Check In Declined");
            n.GetAttributeValue<string>("enmax_acdnbody").Should().Contain("revision date");
        }

        [Fact]
        public void ForceCheckin_notifies_the_affected_submitter()
        {
            var checkoutId = Guid.NewGuid(); var drawingId = Guid.NewGuid();
            var submitter = Guid.NewGuid(); var admin = Guid.NewGuid();
            var ctx = CheckinCtx(checkoutId, drawingId, submitter, checkoutStatus: 1); // Open
            var p = Ctx(ctx, "enmax_acdnForceCheckin", admin);
            p.InputParameters["Target"]      = new EntityReference(CheckoutEntity, checkoutId);
            p.InputParameters["NewRevision"] = "C";
            p.InputParameters["Reason"]      = "User left the drawing checked out for 6 months";

            ctx.ExecutePluginWith<ForceCheckinPlugin>(p);

            var n = OnlyNotification(ctx);
            n.GetAttributeValue<EntityReference>("enmax_acdnrecipient").Id.Should().Be(submitter);
            n.GetAttributeValue<OptionSetValue>("enmax_acdnsourceevent").Value.Should().Be(7, "Force Check In");
        }

        // ── Reservation created → approvers/admins ────────────────────────────

        [Fact]
        public void OnReservationCreated_notifies_approvers_and_admins()
        {
            var ctx = new XrmFakedContext();
            var resId = Guid.NewGuid(); var requester = Guid.NewGuid();
            var approver = Guid.NewGuid(); var adminTeam = Guid.NewGuid(); var approverTeam = Guid.NewGuid();
            ctx.Initialize(new[]
            {
                new Entity(ReservationEntity, resId) { ["enmax_acdnreservationnumber"] = "RES-0099" },
                new Entity("enmax_autocadappconfig", Guid.NewGuid()) { ["enmax_acdnkey"]="AdminTeamId",    ["enmax_acdnvalue"]=adminTeam.ToString() },
                new Entity("enmax_autocadappconfig", Guid.NewGuid()) { ["enmax_acdnkey"]="ApproverTeamId", ["enmax_acdnvalue"]=approverTeam.ToString() },
                new Entity("teammembership", Guid.NewGuid()) { ["teamid"]=approverTeam, ["systemuserid"]=approver },
                new Entity("systemuser", requester) { ["fullname"]="Pat Requester" },
            });
            var p = Ctx(ctx, "Create", requester);
            p.PrimaryEntityId = resId;

            ctx.ExecutePluginWith<OnReservationCreatedPlugin>(p);

            var n = OnlyNotification(ctx);
            n.GetAttributeValue<EntityReference>("enmax_acdnrecipient").Id.Should().Be(approver);
            n.GetAttributeValue<OptionSetValue>("enmax_acdnsourceevent").Value.Should().Be(9, "Reservation Pending");
            n.GetAttributeValue<string>("enmax_acdndeeplinkpath").Should().Be("/approvals");
            n.GetAttributeValue<string>("enmax_acdnbody").Should().Contain("Pat Requester").And.Contain("RES-0099");
        }

        // ── Drawing lifecycle: finalized / obsolete → owner ───────────────────

        [Fact]
        public void FinalizeDrawing_notifies_the_owner()
        {
            var ctx = new XrmFakedContext();
            var drawingId = Guid.NewGuid(); var owner = Guid.NewGuid(); var admin = Guid.NewGuid();
            ctx.Initialize(new[] { new Entity(DrawingEntity, drawingId)
            {
                ["enmax_acdnstate"]           = new OptionSetValue(1), // Available
                ["enmax_acdncurrentrevision"] = "B",                   // checked in at least once (finalize precondition)
                ["ownerid"]                   = new EntityReference("systemuser", owner),
                ["enmax_acdnnumber"]          = "GG-CG-00-0011",
            } });
            var p = Ctx(ctx, "enmax_acdnFinalizeDrawing", admin);
            p.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);
            p.InputParameters["Reason"] = "Project closed out and archived";

            ctx.ExecutePluginWith<FinalizeDrawingPlugin>(p);

            var n = OnlyNotification(ctx);
            n.GetAttributeValue<EntityReference>("enmax_acdnrecipient").Id.Should().Be(owner);
            n.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be(DrawingEntity);
            n.GetAttributeValue<string>("enmax_acdnbody").Should().Contain("GG-CG-00-0011");
        }

        [Fact]
        public void MarkObsolete_notifies_the_owner_with_reason()
        {
            var ctx = new XrmFakedContext();
            var drawingId = Guid.NewGuid(); var owner = Guid.NewGuid(); var admin = Guid.NewGuid();
            ctx.Initialize(new[] { new Entity(DrawingEntity, drawingId)
            {
                ["enmax_acdnstate"]           = new OptionSetValue(1), // non-terminal
                ["enmax_acdncurrentrevision"] = "B",
                ["ownerid"]                   = new EntityReference("systemuser", owner),
                ["enmax_acdnnumber"]          = "GG-CG-00-0012",
            } });
            var p = Ctx(ctx, "enmax_acdnMarkObsolete", admin);
            p.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);
            p.InputParameters["Reason"] = "Superseded by a newer design";

            ctx.ExecutePluginWith<MarkObsoletePlugin>(p);

            var n = OnlyNotification(ctx);
            n.GetAttributeValue<EntityReference>("enmax_acdnrecipient").Id.Should().Be(owner);
            n.GetAttributeValue<OptionSetValue>("enmax_acdnseverity").Value.Should().Be(2, "obsolete is a Warning");
            n.GetAttributeValue<string>("enmax_acdnbody").Should().Contain("Superseded by a newer design");
        }
    }
}
