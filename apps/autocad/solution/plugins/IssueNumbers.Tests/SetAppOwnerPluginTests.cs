using System;
using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class SetAppOwnerPluginTests
    {
        private static XrmFakedPluginExecutionContext BuildPluginCtx(
            XrmFakedContext ctx,
            Entity target,
            string entityName = "enmax_autocadbusiness")
        {
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName       = "Create";
            pluginCtx.Stage             = 20; // PreOperation
            pluginCtx.PrimaryEntityName = entityName;
            pluginCtx.PrimaryEntityId   = target.Id;
            pluginCtx.InputParameters   = new ParameterCollection
            {
                { "Target", target }
            };
            return pluginCtx;
        }

        // ─── Test 1: stamps owner team when owner is unset ───────────────────────

        [Fact]
        public void Create_NoOwnerOnTarget_StampsAppOwnerTeam()
        {
            var teamId = Guid.NewGuid();
            var ctx    = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "AppOwnerTeamId",
                    ["enmax_acdnvalue"] = teamId.ToString(),
                },
            });

            var target    = new Entity("enmax_autocadbusiness") { Id = Guid.NewGuid() };
            var pluginCtx = BuildPluginCtx(ctx, target);

            ctx.ExecutePluginWith<SetAppOwnerPlugin>(pluginCtx);

            target.Contains("ownerid").Should().BeTrue(
                because: "plugin must stamp ownerid when it is absent from the Target");
            var owner = target.GetAttributeValue<EntityReference>("ownerid");
            owner.Should().NotBeNull();
            owner.LogicalName.Should().Be("team",
                because: "the stamped owner must be a team reference");
            owner.Id.Should().Be(teamId,
                because: "the stamped team must match the AppOwnerTeamId config value");
        }

        // ─── Test 2: does not override an explicit owner ─────────────────────────

        [Fact]
        public void Create_OwnerAlreadyOnTarget_LeavesOwnerUnchanged()
        {
            var teamId      = Guid.NewGuid();
            var existingOwner = Guid.NewGuid();
            var ctx         = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "AppOwnerTeamId",
                    ["enmax_acdnvalue"] = teamId.ToString(),
                },
            });

            var target = new Entity("enmax_autocadbusiness") { Id = Guid.NewGuid() };
            target["ownerid"] = new EntityReference("systemuser", existingOwner);
            var pluginCtx = BuildPluginCtx(ctx, target);

            ctx.ExecutePluginWith<SetAppOwnerPlugin>(pluginCtx);

            var owner = target.GetAttributeValue<EntityReference>("ownerid");
            owner.LogicalName.Should().Be("systemuser",
                because: "plugin must not override an owner already set on Target");
            owner.Id.Should().Be(existingOwner,
                because: "plugin must not override an owner already set on Target");
        }

        // ─── Test 3: fail-open when AppOwnerTeamId config is missing ─────────────

        [Fact]
        public void Create_NoConfigKey_FailsOpenWithoutThrowing()
        {
            var ctx       = new XrmFakedContext(); // no AppOwnerTeamId seeded
            var target    = new Entity("enmax_autocadbusiness") { Id = Guid.NewGuid() };
            var pluginCtx = BuildPluginCtx(ctx, target);

            Action execute = () => ctx.ExecutePluginWith<SetAppOwnerPlugin>(pluginCtx);

            execute.Should().NotThrow(
                because: "plugin must be fail-open — missing config must never block a create");
            target.Contains("ownerid").Should().BeFalse(
                because: "plugin must leave ownerid absent when config key is missing");
        }

        // ─── Test 4: fail-open on Guid.Empty placeholder (legacy seed) ───────────

        [Fact]
        public void Create_EmptyGuidConfig_FailsOpenWithoutStampingOwner()
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "AppOwnerTeamId",
                    ["enmax_acdnvalue"] = Guid.Empty.ToString(),
                },
            });

            var target    = new Entity("enmax_autocadbusiness") { Id = Guid.NewGuid() };
            var pluginCtx = BuildPluginCtx(ctx, target);

            Action execute = () => ctx.ExecutePluginWith<SetAppOwnerPlugin>(pluginCtx);

            execute.Should().NotThrow(
                because: "Guid.Empty parses but must not be stamped as ownerid");
            target.Contains("ownerid").Should().BeFalse(
                because: "legacy empty-GUID placeholder must fail-open like missing config");
        }
    }
}
