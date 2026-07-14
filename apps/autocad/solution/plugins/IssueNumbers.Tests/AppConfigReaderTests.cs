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
        [InlineData(2, 3, "EnableFormCheckout", "EnableFormCheckIn")]
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

        [Theory]
        [InlineData(1, null, "DrawingDropOffLibraryUrl", "DrawingDestinationLibraryUrl")]
        [InlineData(2, 1, "StandardDocumentDropOffLibraryUrl", "StandardDocumentDestinationLibraryUrl")]
        [InlineData(2, 2, "ProcedureDocumentDropOffLibraryUrl", "ProcedureDocumentDestinationLibraryUrl")]
        [InlineData(2, 3, "FormDocumentDropOffLibraryUrl", "FormDocumentDestinationLibraryUrl")]
        public void TaxonomyLibraryConfig_ResolveKeys_MatchesTaxonomy(
            int reservationType,
            int? documentSubtype,
            string dropOffKey,
            string destinationKey)
        {
            AppConfigReader.TaxonomyLibraryConfig
                .ResolveDropOffKey(reservationType, documentSubtype)
                .Should().Be(dropOffKey);
            AppConfigReader.TaxonomyLibraryConfig
                .ResolveDestinationKey(reservationType, documentSubtype)
                .Should().Be(destinationKey);
        }

        [Fact]
        public void TaxonomyLibraryConfig_GetDropOffUrl_PrefersTaxonomyKey()
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "DrawingDropOffLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/taxonomy-dropoff",
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "DrawingsDropOffLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/legacy-dropoff",
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "CheckInUploadLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/checkin-upload",
                },
            });
            var svc = ctx.GetFakedOrganizationService();

            AppConfigReader.TaxonomyLibraryConfig
                .GetDropOffUrl(svc, reservationType: 1, documentSubtype: null)
                .Should().Be("https://sp.example/taxonomy-dropoff");
        }

        [Fact]
        public void TaxonomyLibraryConfig_GetDropOffUrl_FallsBackToLegacyKey_WhenTaxonomyKeyAbsent()
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "DocumentsDropOffLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/legacy-documents-dropoff",
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "CheckInUploadLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/checkin-upload",
                },
            });
            var svc = ctx.GetFakedOrganizationService();

            AppConfigReader.TaxonomyLibraryConfig
                .GetDropOffUrl(svc, reservationType: 2, documentSubtype: 1)
                .Should().Be("https://sp.example/legacy-documents-dropoff");
        }

        [Fact]
        public void TaxonomyLibraryConfig_GetDropOffUrl_FallsBackToCheckInUploadLibraryUrl_WhenNoOtherKeySet()
        {
            var ctx = BuildContext("CheckInUploadLibraryUrl", "https://sp.example/checkin-upload");
            var svc = ctx.GetFakedOrganizationService();

            AppConfigReader.TaxonomyLibraryConfig
                .GetDropOffUrl(svc, reservationType: 1, documentSubtype: null)
                .Should().Be("https://sp.example/checkin-upload");
        }

        [Fact]
        public void TaxonomyLibraryConfig_GetDestinationUrl_HasNoCheckInFallback()
        {
            var ctx = BuildContext("CheckInUploadLibraryUrl", "https://sp.example/checkin-upload");
            var svc = ctx.GetFakedOrganizationService();

            AppConfigReader.TaxonomyLibraryConfig
                .GetDestinationUrl(svc, reservationType: 1, documentSubtype: null)
                .Should().BeNull();
        }

        [Fact]
        public void TaxonomyLibraryConfig_GetDestinationUrl_PrefersTaxonomyKeyOverLegacy()
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "FormDocumentDestinationLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/taxonomy-dest",
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "DocumentsDestinationLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/legacy-dest",
                },
            });
            var svc = ctx.GetFakedOrganizationService();

            AppConfigReader.TaxonomyLibraryConfig
                .GetDestinationUrl(svc, reservationType: 2, documentSubtype: 3)
                .Should().Be("https://sp.example/taxonomy-dest");
        }
    }
}
