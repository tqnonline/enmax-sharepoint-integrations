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

        [Fact]
        public void GetBoolDefaultTrue_MissingKey_ReturnsTrue()
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(Array.Empty<Entity>());
            var svc = ctx.GetFakedOrganizationService();

            AppConfigReader.GetBoolDefaultTrue(svc, "EnableDrawingCheckout").Should().BeTrue();
        }

        [Fact]
        public void GetBoolDefaultTrue_ExplicitFalse_ReturnsFalse()
        {
            var ctx = BuildContext("EnableDrawingCheckout", "false");
            var svc = ctx.GetFakedOrganizationService();

            AppConfigReader.GetBoolDefaultTrue(svc, "EnableDrawingCheckout").Should().BeFalse();
        }

        [Theory]
        [InlineData(1, null, "EnableDrawingCheckout", "EnableDrawingCheckIn")]
        [InlineData(2, 1, "EnableStandardCheckout", "EnableStandardCheckIn")]
        [InlineData(2, 2, "EnableProcedureCheckout", "EnableProcedureCheckIn")]
        public void TaxonomyCheckoutConfig_ResolvesKeysByTaxonomy(
            int reservationType,
            int? documentSubtype,
            string checkoutKey,
            string checkInKey)
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = checkoutKey,
                    ["enmax_acdnvalue"] = "false",
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = checkInKey,
                    ["enmax_acdnvalue"] = "false",
                },
            });
            var svc = ctx.GetFakedOrganizationService();

            AppConfigReader.TaxonomyCheckoutConfig
                .IsCheckoutEnabled(svc, reservationType, documentSubtype)
                .Should().BeFalse();
            AppConfigReader.TaxonomyCheckoutConfig
                .IsCheckInEnabled(svc, reservationType, documentSubtype)
                .Should().BeFalse();
        }
    }
}
