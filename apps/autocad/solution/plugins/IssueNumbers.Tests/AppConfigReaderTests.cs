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
        [InlineData(1, 1, "EnableDrawingDocumentCheckout", "EnableDrawingDocumentCheckIn")]
        [InlineData(1, 2, "EnableDrawingCheckout", "EnableDrawingCheckIn")]
        [InlineData(1, null, "EnableDrawingCheckout", "EnableDrawingCheckIn")]
        [InlineData(2, 3, "EnableStandardCheckout", "EnableStandardCheckIn")]
        [InlineData(2, 4, "EnableProcedureCheckout", "EnableProcedureCheckIn")]
        [InlineData(2, 5, "EnableFormCheckout", "EnableFormCheckIn")]
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
        [InlineData(1, "DrawingDropOffLibraryUrl", "DrawingDestinationLibraryUrl")]
        [InlineData(2, "DocumentDropOffLibraryUrl", "DocumentDestinationLibraryUrl")]
        public void TaxonomyLibraryConfig_ResolveKeys_MatchesReservationTypeOnly(
            int reservationType,
            string dropOffKey,
            string destinationKey)
        {
            AppConfigReader.TaxonomyLibraryConfig
                .ResolveDropOffKey(reservationType)
                .Should().Be(dropOffKey);
            AppConfigReader.TaxonomyLibraryConfig
                .ResolveDestinationKey(reservationType)
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
                .GetDropOffUrl(svc, reservationType: 2, documentSubtype: 3)
                .Should().Be("https://sp.example/legacy-documents-dropoff");
        }

        [Fact]
        public void TaxonomyLibraryConfig_GetDropOffUrl_FallsBackToOldSubtypeKey_WhenTypeAndLegacyKeysAbsent()
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "StandardDocumentDropOffLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/old-standard-dropoff",
                },
            });
            var svc = ctx.GetFakedOrganizationService();

            AppConfigReader.TaxonomyLibraryConfig
                .GetDropOffUrl(svc, reservationType: 2, documentSubtype: 3)
                .Should().Be("https://sp.example/old-standard-dropoff");
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
        public void TaxonomyLibraryConfig_GetDestinationUrl_PrefersTypeKeyOverLegacy()
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "DocumentDestinationLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/type-dest",
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "DocumentsDestinationLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/legacy-dest",
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "FormDocumentDestinationLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/old-form-dest",
                },
            });
            var svc = ctx.GetFakedOrganizationService();

            AppConfigReader.TaxonomyLibraryConfig
                .GetDestinationUrl(svc, reservationType: 2, documentSubtype: 5)
                .Should().Be("https://sp.example/type-dest");
        }

        [Fact]
        public void TaxonomyLibraryConfig_GetDestinationUrl_FallsBackToOldSubtypeKey_WhenTypeAndLegacyKeysAbsent()
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(new[]
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "FormDocumentDestinationLibraryUrl",
                    ["enmax_acdnvalue"] = "https://sp.example/old-form-dest",
                },
            });
            var svc = ctx.GetFakedOrganizationService();

            AppConfigReader.TaxonomyLibraryConfig
                .GetDestinationUrl(svc, reservationType: 2, documentSubtype: 5)
                .Should().Be("https://sp.example/old-form-dest");
        }
    }
}
