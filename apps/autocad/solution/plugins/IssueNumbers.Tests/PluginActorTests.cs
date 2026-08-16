using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using System;
using Xunit;

namespace Enmax.AutoCAD.Tests
{
    public class PluginActorTests
    {
        [Fact]
        public void Resolve_uses_initiating_user_when_interactive()
        {
            var ctx = new XrmFakedContext();
            var userId = Guid.NewGuid();
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.InitiatingUserId = userId;

            var svc = ctx.GetOrganizationService();
            var resolved = PluginActor.Resolve(pluginCtx, svc);

            resolved.Should().Be(userId);
        }

        [Fact]
        public void Resolve_prefers_ActingUserId_when_platform_initiating()
        {
            var ctx = new XrmFakedContext();
            var acting = Guid.NewGuid();
            ctx.Initialize(new[]
            {
                new Entity("systemuser", acting)
                {
                    ["fullname"] = "Test User",
                },
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.InitiatingUserId = Guid.Empty;
            pluginCtx.InputParameters[PluginActor.InputName] = acting.ToString();

            var svc = ctx.GetOrganizationService();
            var resolved = PluginActor.ResolveForCustomApi(pluginCtx, svc);

            resolved.Should().Be(acting);
        }

        [Fact]
        public void ResolveForCustomApi_throws_when_platform_and_no_ActingUserId()
        {
            var ctx = new XrmFakedContext();
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.InitiatingUserId = Guid.Empty;

            var svc = ctx.GetOrganizationService();
            Action act = () => PluginActor.ResolveForCustomApi(pluginCtx, svc);

            act.Should().Throw<InvalidPluginExecutionException>()
                .WithMessage("*Missing ActingUserId*");
        }
    }
}
