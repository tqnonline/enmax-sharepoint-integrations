using System;
using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class AppConfigReaderTests
    {
        private static XrmFakedContext BuildContext(string key, string value)
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = key,
                    ["enmax_acdnvalue"] = value,
                },
            });
            return ctx;
        }

        [Fact]
        public void GetValue_ExistingKey_ReturnsValue()
        {
            var ctx = BuildContext("AppOwnerTeamId", "abc-123");
            var svc = ctx.GetFakedOrganizationService();

            var result = AppConfigReader.GetValue(svc, "AppOwnerTeamId");

            result.Should().Be("abc-123");
        }

        [Fact]
        public void GetValue_MissingKey_ReturnsNull()
        {
            var ctx = BuildContext("AppOwnerTeamId", "abc-123");
            var svc = ctx.GetFakedOrganizationService();

            var result = AppConfigReader.GetValue(svc, "NonExistentKey");

            result.Should().BeNull();
        }
    }
}
