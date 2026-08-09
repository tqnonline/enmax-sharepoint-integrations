using Enmax.AutoCAD;
using FluentAssertions;
using Xunit;

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Pins type-partitioned NNNN counter keys (ADR 0001 §3 amended).
    /// Display SequenceKey stays coding-only; counter rows use coding|FAMILY.
    /// </summary>
    public class NumberingFamilyTests
    {
        [Theory]
        [InlineData(null, null, "DRW")]
        [InlineData(TaxonomyConstants.ReservationType.Drawing, null, "DRW")]
        [InlineData(TaxonomyConstants.ReservationType.Drawing, TaxonomyConstants.DocumentSubtype.DrawingDocument, "DRW")]
        [InlineData(TaxonomyConstants.ReservationType.Drawing, TaxonomyConstants.DocumentSubtype.Drawing, "DRW")]
        [InlineData(TaxonomyConstants.ReservationType.Document, TaxonomyConstants.DocumentSubtype.Standard, "STD")]
        [InlineData(TaxonomyConstants.ReservationType.Document, TaxonomyConstants.DocumentSubtype.Procedure, "PRC")]
        [InlineData(TaxonomyConstants.ReservationType.Document, TaxonomyConstants.DocumentSubtype.Form, "FRM")]
        // Dual-read legacy Document subtype ints
        [InlineData(TaxonomyConstants.ReservationType.Document, 1, "STD")]
        [InlineData(TaxonomyConstants.ReservationType.Document, 2, "PRC")]
        public void ResolveNumberingFamily_MapsTypeToFamily(
            int? reservationType, int? documentSubtype, string expectedFamily)
        {
            TaxonomyConstants.ResolveNumberingFamily(reservationType, documentSubtype)
                .Should().Be(expectedFamily);
        }

        [Fact]
        public void ComposeCounterKey_AppendsFamilyToken()
        {
            TaxonomyConstants.ComposeCounterKey("DE-9A-00-AES-AAA-AC", "PRC")
                .Should().Be("DE-9A-00-AES-AAA-AC|PRC");
        }

        [Fact]
        public void ComposeCounterKey_UppercasesAndTrims()
        {
            TaxonomyConstants.ComposeCounterKey(" de-9a-00-aes-aaa-ac ", " drw ")
                .Should().Be("DE-9A-00-AES-AAA-AC|DRW");
        }

        [Fact]
        public void DrawingAndProcedure_ShareCoding_ButNotCounterKey()
        {
            const string coding = "DE-9A-00-AES-AAA-AC";
            var drawingKey = TaxonomyConstants.ComposeCounterKey(
                coding,
                TaxonomyConstants.ResolveNumberingFamily(
                    TaxonomyConstants.ReservationType.Drawing,
                    TaxonomyConstants.DocumentSubtype.Drawing));
            var procedureKey = TaxonomyConstants.ComposeCounterKey(
                coding,
                TaxonomyConstants.ResolveNumberingFamily(
                    TaxonomyConstants.ReservationType.Document,
                    TaxonomyConstants.DocumentSubtype.Procedure));

            drawingKey.Should().Be("DE-9A-00-AES-AAA-AC|DRW");
            procedureKey.Should().Be("DE-9A-00-AES-AAA-AC|PRC");
            drawingKey.Should().NotBe(procedureKey,
                because: "Procedure must not continue the Drawing NNNN counter");
        }
    }
}
