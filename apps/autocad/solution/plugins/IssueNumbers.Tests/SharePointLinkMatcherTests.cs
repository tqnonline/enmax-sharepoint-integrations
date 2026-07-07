using Enmax.AutoCAD;
using FluentAssertions;
using System.Collections.Generic;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class SharePointLinkMatcherTests
    {
        private const string BaseNumber = "GG-CG-00-ECS-AST-DD-0007";
        private const string ChildNumber = "GG-CG-00-ECS-AST-DD-0007-001";

        private static SharePointFoundFile File(
            string fileName,
            SharePointLibraryKind kind,
            string folderPrefix = "/sites/EEC/DropOff/vendorA")
        {
            var serverRelativeUrl = $"{folderPrefix}/{fileName}";
            return new SharePointFoundFile(
                serverRelativeUrl,
                $"https://enmax.sharepoint.com{serverRelativeUrl}",
                kind,
                fileName);
        }

        // ── NormalizeToNumberToken ─────────────────────────────────────────────

        [Theory]
        [InlineData("GG-CG-00-ECS-AST-DD-0007.pdf", "GG-CG-00-ECS-AST-DD-0007")]
        [InlineData("GG-CG-00-ECS-AST-DD-0007.PDF", "GG-CG-00-ECS-AST-DD-0007")]
        [InlineData("GG-CG-00-ECS-AST-DD-0007.Pdf", "GG-CG-00-ECS-AST-DD-0007")]
        [InlineData("  GG-CG-00-ECS-AST-DD-0007.pdf  ", "GG-CG-00-ECS-AST-DD-0007")]
        public void NormalizeToNumberToken_PdfVariants_ReturnsTokenWithoutExtension(
            string fileName,
            string expectedToken)
        {
            SharePointLinkMatcher.NormalizeToNumberToken(fileName).Should().Be(expectedToken);
        }

        [Theory]
        [InlineData("GG-CG-00-ECS-AST-DD-0007.docx")]
        [InlineData("GG-CG-00-ECS-AST-DD-0007")]
        [InlineData("")]
        [InlineData("   ")]
        public void NormalizeToNumberToken_NonPdf_ReturnsNull(string fileName)
        {
            // WHY: only PDF uploads participate in deterministic filename matching.
            SharePointLinkMatcher.NormalizeToNumberToken(fileName).Should().BeNull();
        }

        // ── Matches: base vs child ─────────────────────────────────────────────

        [Fact]
        public void Matches_BaseFilename_MatchesBaseRecordNumber()
        {
            SharePointLinkMatcher.Matches($"{BaseNumber}.pdf", BaseNumber).Should().BeTrue();
        }

        [Fact]
        public void Matches_ChildFilename_MatchesChildRecordNumber()
        {
            SharePointLinkMatcher.Matches($"{ChildNumber}.pdf", ChildNumber).Should().BeTrue();
        }

        [Fact]
        public void Matches_BaseFilename_DoesNotMatchChildRecordNumber()
        {
            // WHY: base and child numbers differ by the -sss suffix; prefix matching would link wrong records.
            SharePointLinkMatcher.Matches($"{BaseNumber}.pdf", ChildNumber).Should().BeFalse();
        }

        [Fact]
        public void Matches_ChildFilename_DoesNotMatchBaseRecordNumber()
        {
            SharePointLinkMatcher.Matches($"{ChildNumber}.pdf", BaseNumber).Should().BeFalse();
        }

        // ── Matches: near-miss non-matches ─────────────────────────────────────

        [Theory]
        [InlineData("GG-CG-00-ECS-AST-DD-0001-001.pdf", "GG-CG-00-ECS-AST-DD-0001-010")]
        [InlineData("GG-CG-00-ECS-AST-DD-0001.pdf", "GG-CG-00-ECS-AST-DD-0011")]
        [InlineData("GG-CG-00-ECS-AST-DD-0001-001.pdf", "GG-CG-00-ECS-AST-DD-0001")]
        public void Matches_NearMiss_DoesNotMatch(string fileName, string recordNumber)
        {
            SharePointLinkMatcher.Matches(fileName, recordNumber).Should().BeFalse();
        }

        [Fact]
        public void Matches_IsCaseInsensitive()
        {
            SharePointLinkMatcher.Matches("gg-cg-00-ecs-ast-dd-0007.pdf", BaseNumber).Should().BeTrue();
        }

        // ── MatchFiles: folder-agnostic ──────────────────────────────────────

        [Fact]
        public void MatchFiles_SameFilenameDifferentFolders_MatchesBothLibraries()
        {
            var files = new[]
            {
                File($"{BaseNumber}.pdf", SharePointLibraryKind.DropOff, "/sites/EEC/DropOff/vendorA/projectX"),
                File($"{BaseNumber}.pdf", SharePointLibraryKind.Destination, "/sites/EEC/Destination/vendorB/projectY"),
            };

            var result = SharePointLinkMatcher.MatchFiles(BaseNumber, files);

            result.PresentInDropOff.Should().BeTrue();
            result.PresentInDestination.Should().BeTrue();
            result.DropOffUrl.Should().Contain("/DropOff/vendorA/projectX/");
            result.DestinationUrl.Should().Contain("/Destination/vendorB/projectY/");
        }

        [Fact]
        public void MatchFiles_DropOffOnly_SetsDropOffFlagsAndUrl()
        {
            var files = new[] { File($"{BaseNumber}.pdf", SharePointLibraryKind.DropOff) };

            var result = SharePointLinkMatcher.MatchFiles(BaseNumber, files);

            result.PresentInDropOff.Should().BeTrue();
            result.PresentInDestination.Should().BeFalse();
            result.DropOffUrl.Should().NotBeNullOrEmpty();
            result.DestinationUrl.Should().BeNull();
        }

        [Fact]
        public void MatchFiles_DestinationOnly_SetsDestinationFlagsAndUrl()
        {
            var files = new[] { File($"{BaseNumber}.pdf", SharePointLibraryKind.Destination, "/sites/EEC/Destination") };

            var result = SharePointLinkMatcher.MatchFiles(BaseNumber, files);

            result.PresentInDropOff.Should().BeFalse();
            result.PresentInDestination.Should().BeTrue();
            result.DestinationUrl.Should().NotBeNullOrEmpty();
            result.DropOffUrl.Should().BeNull();
        }

        [Fact]
        public void MatchFiles_NoMatchingFiles_ReturnsEmptyState()
        {
            var files = new[]
            {
                File($"{ChildNumber}.pdf", SharePointLibraryKind.DropOff),
                File("OTHER-NUMBER.pdf", SharePointLibraryKind.Destination),
            };

            var result = SharePointLinkMatcher.MatchFiles(BaseNumber, files);

            result.PresentInDropOff.Should().BeFalse();
            result.PresentInDestination.Should().BeFalse();
            result.DropOffUrl.Should().BeNull();
            result.DestinationUrl.Should().BeNull();
        }

        [Fact]
        public void MatchFiles_UnmatchedFilesAreIgnored()
        {
            var files = new List<SharePointFoundFile>
            {
                File("WRONG-NUMBER.pdf", SharePointLibraryKind.DropOff),
                File($"{BaseNumber}.pdf", SharePointLibraryKind.Destination, "/sites/EEC/Destination"),
            };

            var result = SharePointLinkMatcher.MatchFiles(BaseNumber, files);

            result.PresentInDropOff.Should().BeFalse();
            result.PresentInDestination.Should().BeTrue();
        }

        [Fact]
        public void MatchFiles_UsesFirstMatchPerLibraryKind()
        {
            var firstDropOff = File($"{BaseNumber}.pdf", SharePointLibraryKind.DropOff, "/sites/EEC/DropOff/first");
            var secondDropOff = File($"{BaseNumber}.pdf", SharePointLibraryKind.DropOff, "/sites/EEC/DropOff/second");

            var result = SharePointLinkMatcher.MatchFiles(BaseNumber, new[] { firstDropOff, secondDropOff });

            result.DropOffUrl.Should().Be(firstDropOff.AbsoluteUrl);
        }

        // ── ComputeUpsert ──────────────────────────────────────────────────────

        [Fact]
        public void ComputeUpsert_IdenticalInputs_NoUpdateNeeded()
        {
            var state = new SharePointLinkState(
                "https://enmax.sharepoint.com/drop",
                "https://enmax.sharepoint.com/dest",
                presentInDropOff: true,
                presentInDestination: true);

            var derived = new SharePointLinkMatchResult(
                state.DropOffUrl,
                state.DestinationUrl,
                state.PresentInDropOff,
                state.PresentInDestination);

            var decision = SharePointLinkMatcher.ComputeUpsert(state, derived);

            decision.UpdateNeeded.Should().BeFalse();
            decision.NewState.Should().Be(state);
        }

        [Fact]
        public void ComputeUpsert_NewlyAppearedFile_SetsUrlAndFlag()
        {
            var current = new SharePointLinkState(null, null, false, false);
            var derived = new SharePointLinkMatchResult(
                "https://enmax.sharepoint.com/drop/file.pdf",
                null,
                presentInDropOff: true,
                presentInDestination: false);

            var decision = SharePointLinkMatcher.ComputeUpsert(current, derived);

            decision.UpdateNeeded.Should().BeTrue();
            decision.NewState.DropOffUrl.Should().Be(derived.DropOffUrl);
            decision.NewState.PresentInDropOff.Should().BeTrue();
        }

        [Fact]
        public void ComputeUpsert_RemovedFile_ClearsUrlAndFlag()
        {
            var current = new SharePointLinkState(
                "https://enmax.sharepoint.com/drop/file.pdf",
                "https://enmax.sharepoint.com/dest/file.pdf",
                presentInDropOff: true,
                presentInDestination: true);

            var derived = new SharePointLinkMatchResult(null, null, false, false);

            var decision = SharePointLinkMatcher.ComputeUpsert(current, derived);

            // WHY: deletion in SharePoint must clear stored links so stale URLs are not shown.
            decision.UpdateNeeded.Should().BeTrue();
            decision.NewState.DropOffUrl.Should().BeNull();
            decision.NewState.DestinationUrl.Should().BeNull();
            decision.NewState.PresentInDropOff.Should().BeFalse();
            decision.NewState.PresentInDestination.Should().BeFalse();
        }

        [Fact]
        public void ComputeUpsert_ReRunAfterUpdate_IsIdempotent()
        {
            var current = new SharePointLinkState(null, null, false, false);
            var derived = new SharePointLinkMatchResult(
                "https://enmax.sharepoint.com/drop/file.pdf",
                null,
                presentInDropOff: true,
                presentInDestination: false);

            var first = SharePointLinkMatcher.ComputeUpsert(current, derived);
            var second = SharePointLinkMatcher.ComputeUpsert(first.NewState, derived);

            first.UpdateNeeded.Should().BeTrue();
            second.UpdateNeeded.Should().BeFalse();
        }

        [Fact]
        public void Matches_RecordNumberWithSurroundingWhitespace_StillMatches()
        {
            SharePointLinkMatcher.Matches($"{BaseNumber}.pdf", $"  {BaseNumber}  ").Should().BeTrue();
        }
    }
}
