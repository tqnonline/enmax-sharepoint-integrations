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

            /// <summary>Type Document. Base-only.</summary>
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

        /// <summary>Drawing Document / Standard / Procedure carry the PDF on the base record.</summary>
        public static bool IsBaseOnlyDocument(int? reservationType, int? documentSubtype)
        {
            var subtype = NormalizeDocumentSubtype(reservationType, documentSubtype);

            if (reservationType == ReservationType.Document)
                return subtype == DocumentSubtype.Standard || subtype == DocumentSubtype.Procedure;

            if (reservationType == ReservationType.Drawing)
                return subtype == DocumentSubtype.DrawingDocument;

            return false;
        }

        /// <summary>Drawing (numbered) and Form produce -SSS children; legacy null type defaults to children.</summary>
        public static bool CreatesChildItems(int? reservationType, int? documentSubtype)
        {
            var subtype = NormalizeDocumentSubtype(reservationType, documentSubtype);

            if (reservationType == ReservationType.Document)
                return subtype == DocumentSubtype.Form;

            if (reservationType == ReservationType.Drawing)
                return subtype != DocumentSubtype.DrawingDocument;

            return true;
        }
    }
}
