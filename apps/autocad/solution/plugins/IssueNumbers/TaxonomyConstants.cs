namespace Enmax.AutoCAD
{
    /// <summary>
    /// Canonical taxonomy option values for <c>enmax_acdnreservationtype</c> and
    /// <c>enmax_acdndocumentsubtype</c> (docs/drawing-document-subtype-CONTRACT.md).
    /// </summary>
    public static class TaxonomyConstants
    {
        public static class ReservationType
        {
            public const int None = 0;
            public const int Drawing = 1;
            public const int Document = 2;
        }

        public static class DocumentSubtype
        {
            public const int None = 0;

            /// <summary>Type Drawing. Base-only + singleton sheet, New sequence only, checkout ON by default.</summary>
            public const int DrawingDocument = 1;

            /// <summary>Type Drawing. Numbered children, New + Existing sequence.</summary>
            public const int Drawing = 2;

            /// <summary>Type Document. Base-only.</summary>
            public const int Standard = 3;

            /// <summary>Type Document. Procedure bases + optional Form children (-SSS) when sheets ≥ 1.</summary>
            public const int Procedure = 4;

            /// <summary>Type Document. Numbered children, Existing sequence only.</summary>
            public const int Form = 5;
        }

        /// <summary>
        /// Dual-read for Heather remumber cutover: when type is Document, pre-remap
        /// Standard=1 / Procedure=2 map to the new ints. Safe because Drawing Document (1)
        /// and Drawing (2) only appear under type Drawing.
        /// Document+3 is Standard after remumber; old Form (3) is ambiguous — run
        /// <c>migrate_document_subtype_heather.py</c> in the same release as these plugins.
        /// </summary>
        public static int? NormalizeDocumentSubtype(int? reservationType, int? documentSubtype)
        {
            if (reservationType != ReservationType.Document || !documentSubtype.HasValue)
                return documentSubtype;

            if (documentSubtype.Value == 1) return DocumentSubtype.Standard;
            if (documentSubtype.Value == 2) return DocumentSubtype.Procedure;
            return documentSubtype;
        }

        /// <summary>
        /// Numbering-family token for partitioning the NNNN counter (ADR 0001 amended).
        /// Displayed numbers stay BB-AA-UU-DDD-SSS-KK-NNNN; the counter row key is coding|FAMILY.
        /// Drawing Document and Drawing share DRW; Standard/Procedure/Form each have their own.
        /// </summary>
        public static class NumberingFamily
        {
            public const string Drawing = "DRW";
            public const string Standard = "STD";
            public const string Procedure = "PRC";
            public const string Form = "FRM";
        }

        /// <summary>
        /// Resolves the NNNN counter family for a reservation type/subtype.
        /// Null/legacy defaults to Drawing (historical Drawing-only issuance).
        /// </summary>
        public static string ResolveNumberingFamily(int? reservationType, int? documentSubtype)
        {
            var subtype = NormalizeDocumentSubtype(reservationType, documentSubtype);

            if (reservationType == ReservationType.Document)
            {
                if (subtype == DocumentSubtype.Standard) return NumberingFamily.Standard;
                if (subtype == DocumentSubtype.Procedure) return NumberingFamily.Procedure;
                if (subtype == DocumentSubtype.Form) return NumberingFamily.Form;
                return NumberingFamily.Standard;
            }

            return NumberingFamily.Drawing;
        }

        /// <summary>
        /// Counter row key: {coding}|{family}. Display SequenceKey / drawing numbers use coding only.
        /// </summary>
        public static string ComposeCounterKey(string coding, string family)
        {
            if (string.IsNullOrWhiteSpace(coding)) return coding;
            if (string.IsNullOrWhiteSpace(family)) return coding.Trim().ToUpperInvariant();
            return $"{coding.Trim().ToUpperInvariant()}|{family.Trim().ToUpperInvariant()}";
        }

        /// <summary>Drawing Document / Standard carry the PDF on the base record (singleton sheet).</summary>
        public static bool IsBaseOnlyDocument(int? reservationType, int? documentSubtype)
        {
            var subtype = NormalizeDocumentSubtype(reservationType, documentSubtype);

            if (reservationType == ReservationType.Document)
                return subtype == DocumentSubtype.Standard;

            if (reservationType == ReservationType.Drawing)
                return subtype == DocumentSubtype.DrawingDocument;

            return false;
        }

        /// <summary>
        /// Drawing (numbered), Procedure, and Form produce -SSS children; legacy null type defaults to children.
        /// Procedure with sheetsPerDrawing=0 still issues bases only (singleton carrier) at issuance time.
        /// </summary>
        public static bool CreatesChildItems(int? reservationType, int? documentSubtype)
        {
            var subtype = NormalizeDocumentSubtype(reservationType, documentSubtype);

            if (reservationType == ReservationType.Document)
                return subtype == DocumentSubtype.Form || subtype == DocumentSubtype.Procedure;

            if (reservationType == ReservationType.Drawing)
                return subtype != DocumentSubtype.DrawingDocument;

            return true;
        }
    }
}
