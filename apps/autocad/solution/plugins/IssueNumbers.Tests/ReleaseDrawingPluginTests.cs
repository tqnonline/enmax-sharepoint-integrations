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
    public class ReleaseDrawingPluginTests
    {
        private const string DrawingEntity = "enmax_autocaddrawing";
        private const string SheetEntity   = "enmax_autocadsheet";
        private const string AuditEntity   = "enmax_autocadauditevent";
        private const string NotifEntity   = "enmax_autocadinappnotification";
        private const string ColState      = "enmax_acdnstate";
        private const int StateAvailable = 1, StateCheckedOut = 2, StateVoid = 6;
        private const string ValidReason = "Number no longer required; project was cancelled by the business.";

        private static readonly Guid AdminTeamId    = Guid.NewGuid();
        private static readonly Guid ApproverTeamId = Guid.NewGuid();

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pctx, Guid drawingId, Guid ownerId)
            Build(int state = StateAvailable, string reason = ValidReason, bool callerIsOwner = true,
                  string number = "0042", bool callerIsAdmin = false)
        {
            var ctx = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var ownerId   = Guid.NewGuid();
            var callerId  = callerIsOwner ? ownerId : Guid.NewGuid();
            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColState]            = new OptionSetValue(state),
                ["enmax_acdnnumber"]  = number,
                ["ownerid"]           = new EntityReference("systemuser", ownerId) { Name = "Test Owner" },
            };
            var sheet = new Entity(SheetEntity, Guid.NewGuid())
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                [ColState]            = new OptionSetValue(2),
            };

            var seed = new System.Collections.Generic.List<Entity>
            {
                drawing, sheet,
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
            };

            if (callerIsAdmin)
                seed.Add(new Entity("teammembership", Guid.NewGuid())
                {
                    ["teamid"]       = AdminTeamId,
                    ["systemuserid"] = callerId,
                });

            ctx.Initialize(seed);
            var pctx = ctx.GetDefaultPluginContext();
            pctx.MessageName      = "enmax_acdnReleaseDrawing";
            pctx.Stage            = 40;
            pctx.InitiatingUserId = callerId;
            pctx.InputParameters  = new ParameterCollection();
            pctx.OutputParameters = new ParameterCollection();
            pctx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);
            pctx.InputParameters["Reason"] = reason;
            return (ctx, pctx, drawingId, ownerId);
        }

        [Fact]
        public void Self_release_voids_drawing_and_sheets_writes_StateChanged_audit_no_notification()
        {
            var (ctx, pctx, drawingId, _) = Build(callerIsOwner: true);
            ctx.ExecutePluginWith<ReleaseDrawingPlugin>(pctx);
            var svc = ctx.GetFakedOrganizationService();

            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColState))
               .GetAttributeValue<OptionSetValue>(ColState).Value.Should().Be(StateVoid);
            svc.RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet(ColState) })
               .Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>(ColState).Value == StateVoid);

            var audit = svc.RetrieveMultiple(new QueryExpression(AuditEntity) { ColumnSet = new ColumnSet(true) }).Entities;
            audit.Should().ContainSingle();
            audit[0].GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(2); // StateChanged
            audit[0].GetAttributeValue<string>("enmax_acdntostate").Should().Be("Void");

            svc.RetrieveMultiple(new QueryExpression(NotifEntity) { ColumnSet = new ColumnSet(true) })
               .Entities.Should().BeEmpty("self-release notifies no one");

            pctx.OutputParameters["NewState"].Should().Be("Void");
            pctx.OutputParameters["SequenceKeyBurned"].Should().Be("0042");
        }

        [Fact]
        public void Non_Available_drawing_throws()
        {
            var (ctx, pctx, _, _) = Build(state: StateCheckedOut);
            Action act = () => ctx.ExecutePluginWith<ReleaseDrawingPlugin>(pctx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*Available*");
        }

        [Fact]
        public void Short_reason_throws()
        {
            var (ctx, pctx, _, _) = Build(reason: "nope");
            Action act = () => ctx.ExecutePluginWith<ReleaseDrawingPlugin>(pctx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*10*");
        }

        [Fact]
        public void Missing_target_throws()
        {
            var (ctx, pctx, _, _) = Build();
            pctx.InputParameters.Remove("Target");
            Action act = () => ctx.ExecutePluginWith<ReleaseDrawingPlugin>(pctx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*Target*");
        }

        [Fact]
        public void Force_release_by_non_owner_writes_OverrideUsed_audit_and_notifies_owner()
        {
            var (ctx, pctx, drawingId, ownerId) = Build(callerIsOwner: false, callerIsAdmin: true);
            ctx.ExecutePluginWith<ReleaseDrawingPlugin>(pctx);
            var svc = ctx.GetFakedOrganizationService();

            var audit = svc.RetrieveMultiple(new QueryExpression(AuditEntity) { ColumnSet = new ColumnSet(true) }).Entities;
            audit.Should().ContainSingle();
            audit[0].GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(5); // OverrideUsed
            audit[0].GetAttributeValue<string>("enmax_acdnreason").Should().Contain("originally owned by");

            var notif = svc.RetrieveMultiple(new QueryExpression(NotifEntity) { ColumnSet = new ColumnSet(true) }).Entities;
            notif.Should().ContainSingle();
            notif[0].GetAttributeValue<EntityReference>("enmax_acdnrecipient").Id.Should().Be(ownerId);
            notif[0].GetAttributeValue<OptionSetValue>("enmax_acdnseverity").Value.Should().Be(3); // Warning
            notif[0].GetAttributeValue<bool>("enmax_acdnread").Should().BeFalse();
        }

        [Fact]
        public void Drawing_with_checkout_history_throws_even_when_Available()
        {
            // Business rule: a number that was ever checked out is "used" and cannot be
            // released/voided — even if the drawing has cycled back to Available.
            var (ctx, pctx, drawingId, _) = Build(StateAvailable);
            var svc = ctx.GetFakedOrganizationService();
            svc.Create(new Entity("enmax_autocadcheckout")
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
            });

            Action act = () => ctx.ExecutePluginWith<ReleaseDrawingPlugin>(pctx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*checked out*");

            // Drawing must remain Available (release rejected, no state change)
            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColState))
               .GetAttributeValue<OptionSetValue>(ColState).Value.Should().Be(StateAvailable);
        }

        [Fact]
        public void Non_owner_non_admin_cannot_force_release_drawing()
        {
            // caller != owner (isForce = true) but caller is not Admin → gate must deny before any mutation.
            var (ctx, pctx, drawingId, _) = Build(callerIsOwner: false, callerIsAdmin: false);

            Action act = () => ctx.ExecutePluginWith<ReleaseDrawingPlugin>(pctx);

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*not authorized*",
                   because: "force-releasing someone else's drawing requires admin rights; plain users must be denied");

            var svc = ctx.GetFakedOrganizationService();

            // Drawing must remain Available — the gate fires before the state change.
            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColState))
               .GetAttributeValue<OptionSetValue>(ColState).Value
               .Should().Be(StateAvailable, because: "the gate fires before the void update");

            // No notification must be created.
            svc.RetrieveMultiple(new QueryExpression(NotifEntity) { ColumnSet = new ColumnSet(false) })
               .Entities.Should().BeEmpty(because: "no notification must be sent when the gate denies the request");
        }
    }
}
