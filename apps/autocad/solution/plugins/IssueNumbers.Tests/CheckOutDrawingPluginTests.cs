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

        // -----------------------------------------------------------------------
        // Helpers
        // -----------------------------------------------------------------------

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid drawingId)
            BuildContext(int drawingState = StateAvailable)
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var userId    = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState] = new OptionSetValue(drawingState),
            };
            ctx.Initialize(new[] { drawing });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnCheckOutDrawing";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = userId;
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
        public void CheckOut_transitions_related_sheets_to_CheckedOut()
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var userId    = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId) { [ColDrawingState] = new OptionSetValue(StateAvailable) };
            var sheet1  = new Entity("enmax_autocadsheet", Guid.NewGuid())
                { ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId), ["enmax_acdnstate"] = new OptionSetValue(2) };
            var sheet2  = new Entity("enmax_autocadsheet", Guid.NewGuid())
                { ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId), ["enmax_acdnstate"] = new OptionSetValue(2) };
            ctx.Initialize(new[] { drawing, sheet1, sheet2 });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnCheckOutDrawing";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = userId;
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);

            ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

            var sheets = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") });
            sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 3,
                because: "all sheets of a checked-out drawing must move to sheet CheckedOut = 3");
        }
    }
}
