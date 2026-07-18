using System.Collections.Generic;
using System.Linq;

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Taxonomy matrix — the single source of truth for reservation type ×
    /// document subtype behaviour (docs/drawing-document-subtype-CONTRACT.md).
    ///
    /// This fixture is intentionally duplicated (same rows, same shape) in:
    ///   - apps/code-app/src/__tests__/taxonomy/taxonomyMatrix.ts
    ///   - solution/plugins/IssueNumbers.Tests/TaxonomyMatrix.cs (this file)
    ///   - solution/scripts/tests/taxonomy_matrix.py
    /// Keep all three in sync when the taxonomy changes.
    /// </summary>
    public enum LibraryPair
    {
        Drawing,
        Document,
    }

    public sealed class TaxonomyMatrixRow
    {
        public int ReservationType { get; set; }
        public int DocumentSubtype { get; set; }
        public string Label { get; set; }
        public bool CreatesChildren { get; set; }
        public bool BasePdf { get; set; }
        public LibraryPair LibraryPair { get; set; }
        public bool ExistingAllowed { get; set; }
        public bool CheckoutDefault { get; set; }
        public bool AppendAllowed { get; set; }
    }

    public static class TaxonomyMatrix
    {
        public static readonly IReadOnlyList<TaxonomyMatrixRow> Rows = new List<TaxonomyMatrixRow>
        {
            new TaxonomyMatrixRow
            {
                ReservationType = 1,
                DocumentSubtype = 1,
                Label = "Drawing Document",
                CreatesChildren = false,
                BasePdf = true,
                LibraryPair = LibraryPair.Drawing,
                ExistingAllowed = false,
                CheckoutDefault = true,
                AppendAllowed = false,
            },
            new TaxonomyMatrixRow
            {
                ReservationType = 1,
                DocumentSubtype = 2,
                Label = "Drawing",
                CreatesChildren = true,
                BasePdf = true,
                LibraryPair = LibraryPair.Drawing,
                ExistingAllowed = true,
                CheckoutDefault = true,
                AppendAllowed = true,
            },
            new TaxonomyMatrixRow
            {
                ReservationType = 2,
                DocumentSubtype = 3,
                Label = "Standard Document",
                CreatesChildren = false,
                BasePdf = true,
                LibraryPair = LibraryPair.Document,
                ExistingAllowed = false,
                CheckoutDefault = true,
                AppendAllowed = false,
            },
            new TaxonomyMatrixRow
            {
                ReservationType = 2,
                DocumentSubtype = 4,
                Label = "Procedure",
                CreatesChildren = false,
                BasePdf = true,
                LibraryPair = LibraryPair.Document,
                ExistingAllowed = false,
                CheckoutDefault = true,
                AppendAllowed = false,
            },
            new TaxonomyMatrixRow
            {
                ReservationType = 2,
                DocumentSubtype = 5,
                Label = "Form",
                CreatesChildren = true,
                BasePdf = false,
                LibraryPair = LibraryPair.Document,
                ExistingAllowed = true,
                CheckoutDefault = true,
                AppendAllowed = true,
            },
        };

        public static TaxonomyMatrixRow Find(int reservationType, int documentSubtype)
            => Rows.FirstOrDefault(r => r.ReservationType == reservationType && r.DocumentSubtype == documentSubtype);
    }
}
