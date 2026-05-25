using System;
using System.Linq;
using Enmax.AutoCAD;
using FakeXrmEasy;
using Microsoft.Xrm.Sdk;
using Xunit;
using FluentAssertions;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class AuditEmitterTests
    {
        private const int EventReferenceDataChanged = 8;
        private const int SourceAction              = 4;

        private static XrmFakedContext BuildContext() => new XrmFakedContext();

        private static Guid ExecutePlugin(
            XrmFakedContext ctx,
            string entityName,
            string message,
            Guid?  entityId  = null,
            Entity target    = null)
        {
            var id = entityId ?? Guid.NewGuid();
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName       = message;
            pluginCtx.PrimaryEntityName = entityName;
            pluginCtx.PrimaryEntityId   = id;
            pluginCtx.Stage             = 40; // PostOperation
            pluginCtx.InputParameters   = new ParameterCollection
            {
                { "Target", target ?? new Entity(entityName, id) }
            };

            ctx.ExecutePluginWith<AuditEmitter>(pluginCtx);
            return id;
        }

        private static Entity GetFirstAuditEvent(XrmFakedContext ctx)
        {
            return ctx.CreateQuery("enmax_autocadauditevent").FirstOrDefault() as Entity;
        }

        // ─── Reference table: Create ───────────────────────────────────────────

        [Theory]
        [InlineData("enmax_autocadbusiness")]
        [InlineData("enmax_autocadasset")]
        [InlineData("enmax_autocadunit")]
        [InlineData("enmax_autocaddomain")]
        [InlineData("enmax_autocadsystem")]
        [InlineData("enmax_autocadkind")]
        [InlineData("enmax_autocadrecordtype")]
        [InlineData("enmax_autocadrecordphase")]
        [InlineData("enmax_autocadvendor")]
        [InlineData("enmax_autocadbusinessasset")]
        [InlineData("enmax_autocadassetunit")]
        [InlineData("enmax_autocadsystemscope")]
        public void Create_OnReferenceTable_WritesAuditEvent(string entityName)
        {
            var ctx = BuildContext();
            ExecutePlugin(ctx, entityName, "Create");

            var audit = GetFirstAuditEvent(ctx);
            audit.Should().NotBeNull();
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value
                 .Should().Be(EventReferenceDataChanged,
                     because: "reference-table CRUD must be logged as event 8 = Reference Data Changed");
            audit.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be(entityName);
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnsource").Value.Should().Be(SourceAction);
        }

        // ─── Reference table: Update ───────────────────────────────────────────

        [Fact]
        public void Update_OnBusiness_WritesAuditEvent()
        {
            var ctx = BuildContext();
            var target = new Entity("enmax_autocadbusiness", Guid.NewGuid())
            {
                ["enmax_acdndisplayname"] = "Updated Name"
            };
            ExecutePlugin(ctx, "enmax_autocadbusiness", "Update", target: target);

            var audit = GetFirstAuditEvent(ctx);
            audit.Should().NotBeNull();
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(EventReferenceDataChanged);
        }

        // ─── Reference table: Delete ───────────────────────────────────────────

        [Fact]
        public void Delete_OnVendor_WritesAuditEvent()
        {
            var ctx = BuildContext();
            ExecutePlugin(ctx, "enmax_autocadvendor", "Delete");

            var audit = GetFirstAuditEvent(ctx);
            audit.Should().NotBeNull();
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(EventReferenceDataChanged);
            audit.GetAttributeValue<string>("enmax_acdnreason").Should().Contain("deleted");
        }

        // ─── Reference table: Deactivate (Update + statecode) ─────────────────

        [Fact]
        public void Update_WithStatecodeChange_WritesDeactivatedReason()
        {
            var ctx = BuildContext();
            var target = new Entity("enmax_autocadbusiness", Guid.NewGuid())
            {
                ["statecode"] = new OptionSetValue(1) // Inactive
            };
            ExecutePlugin(ctx, "enmax_autocadbusiness", "Update", target: target);

            var audit = GetFirstAuditEvent(ctx);
            audit.GetAttributeValue<string>("enmax_acdnreason").Should().Contain("deactivated");
        }

        [Fact]
        public void Update_WithStatecodeActive_WritesActivatedReason()
        {
            var ctx = BuildContext();
            var target = new Entity("enmax_autocadbusiness", Guid.NewGuid())
            {
                ["statecode"] = new OptionSetValue(0) // Active
            };
            ExecutePlugin(ctx, "enmax_autocadbusiness", "Update", target: target);

            var audit = GetFirstAuditEvent(ctx);
            audit.GetAttributeValue<string>("enmax_acdnreason").Should().Contain("activated");
        }

        // ─── Checkout: NO LONGER handled here (plan-12 §4.4) ──────────────────
        // Checkout/drawing lifecycle audit is owned by the lifecycle plugins, which key
        // audit to the drawing. AuditEmitter must NOT write a checkout-keyed audit row,
        // otherwise the timeline gets double entries.

        [Fact]
        public void Update_Checkout_StatusChange_WritesNoAuditEvent()
        {
            var ctx        = BuildContext();
            var checkoutId = Guid.NewGuid();
            var target = new Entity("enmax_autocadcheckout", checkoutId)
            {
                ["enmax_acdnstatus"] = new OptionSetValue(2)
            };

            ExecutePlugin(ctx, "enmax_autocadcheckout", "Update", checkoutId, target);

            var audit = GetFirstAuditEvent(ctx);
            audit.Should().BeNull(
                because: "checkout audit is owned by the lifecycle plugins (keyed to the drawing); " +
                         "AuditEmitter must not double-write a checkout-keyed row");
        }

        // ─── Unknown entity: no event ──────────────────────────────────────────

        [Fact]
        public void Create_OnUnknownEntity_WritesNoAuditEvent()
        {
            var ctx = BuildContext();
            ExecutePlugin(ctx, "account", "Create");

            var audit = GetFirstAuditEvent(ctx);
            audit.Should().BeNull("unknown entity should not produce an audit event");
        }
    }
}
