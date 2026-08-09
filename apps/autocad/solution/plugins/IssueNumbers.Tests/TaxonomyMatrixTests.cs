using Enmax.AutoCAD;
using FluentAssertions;
using System.Linq;
using Xunit;

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Asserts the C# TaxonomyMatrix fixture stays in sync with
    /// Enmax.AutoCAD.TaxonomyConstants (docs/drawing-document-subtype-CONTRACT.md).
    /// Mirrors apps/code-app/src/__tests__/taxonomy/taxonomyMatrix.test.ts and
    /// solution/scripts/tests/test_taxonomy_matrix_consistency.py.
    /// </summary>
    public class TaxonomyMatrixTests
    {
        [Fact]
        public void HasExactlyFiveRows_OnePerKnownDocumentSubtype()
        {
            TaxonomyMatrix.Rows.Should().HaveCount(5);
            TaxonomyMatrix.Rows.Select(r => r.DocumentSubtype).OrderBy(v => v)
                .Should().BeEquivalentTo(new[] { 1, 2, 3, 4, 5 }, o => o.WithStrictOrdering());
        }

        [Fact]
        public void RowsMatchTaxonomyConstants()
        {
            TaxonomyMatrix.Find(TaxonomyConstants.ReservationType.Drawing, TaxonomyConstants.DocumentSubtype.DrawingDocument)
                .Label.Should().Be("Drawing Document");
            TaxonomyMatrix.Find(TaxonomyConstants.ReservationType.Drawing, TaxonomyConstants.DocumentSubtype.Drawing)
                .Label.Should().Be("Drawing");
            TaxonomyMatrix.Find(TaxonomyConstants.ReservationType.Document, TaxonomyConstants.DocumentSubtype.Standard)
                .Label.Should().Be("Standard");
            TaxonomyMatrix.Find(TaxonomyConstants.ReservationType.Document, TaxonomyConstants.DocumentSubtype.Procedure)
                .Label.Should().Be("Procedure");
            TaxonomyMatrix.Find(TaxonomyConstants.ReservationType.Document, TaxonomyConstants.DocumentSubtype.Form)
                .Label.Should().Be("Form");
        }

        [Fact]
        public void DrawingTypeRowsUseDrawingLibraryPair_DocumentTypeRowsUseDocument()
        {
            foreach (var row in TaxonomyMatrix.Rows)
            {
                if (row.ReservationType == TaxonomyConstants.ReservationType.Drawing)
                {
                    row.LibraryPair.Should().Be(LibraryPair.Drawing);
                }
                else
                {
                    row.LibraryPair.Should().Be(LibraryPair.Document);
                }
            }
        }

        [Fact]
        public void DrawingProcedureAndFormCreateChildren_ExistingOnlyForDrawingAndForm()
        {
            foreach (var row in TaxonomyMatrix.Rows)
            {
                bool createsChildren = row.DocumentSubtype == TaxonomyConstants.DocumentSubtype.Drawing
                    || row.DocumentSubtype == TaxonomyConstants.DocumentSubtype.Procedure
                    || row.DocumentSubtype == TaxonomyConstants.DocumentSubtype.Form;
                bool existingOrAppend = row.DocumentSubtype == TaxonomyConstants.DocumentSubtype.Drawing
                    || row.DocumentSubtype == TaxonomyConstants.DocumentSubtype.Form;
                row.CreatesChildren.Should().Be(createsChildren);
                row.ExistingAllowed.Should().Be(existingOrAppend);
                row.AppendAllowed.Should().Be(existingOrAppend);
            }
        }

        [Fact]
        public void DrawingDocumentDisallowsExistingSequence_NewOnly()
        {
            var row = TaxonomyMatrix.Find(
                TaxonomyConstants.ReservationType.Drawing,
                TaxonomyConstants.DocumentSubtype.DrawingDocument);
            row.ExistingAllowed.Should().BeFalse();
        }

        [Fact]
        public void EveryRowDefaultsCheckoutEnabled()
        {
            foreach (var row in TaxonomyMatrix.Rows)
            {
                row.CheckoutDefault.Should().BeTrue();
            }
        }
    }
}
