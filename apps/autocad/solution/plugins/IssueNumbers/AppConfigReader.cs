using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Enmax.AutoCAD
{
    /// <summary>Reads a single App Configuration value by key. Returns null if absent.</summary>
    public static class AppConfigReader
    {
        private const string AppConfigEntity = "enmax_autocadappconfig";
        private const string ColKey   = "enmax_acdnkey";
        private const string ColValue = "enmax_acdnvalue";

        public static string GetValue(IOrganizationService service, string key)
        {
            var q = new QueryExpression(AppConfigEntity)
            {
                ColumnSet = new ColumnSet(ColValue),
                TopCount  = 1,
            };
            q.Criteria.AddCondition(ColKey, ConditionOperator.Equal, key);
            var r = service.RetrieveMultiple(q);
            return r.Entities.Count > 0 ? r.Entities[0].GetAttributeValue<string>(ColValue) : null;
        }

        /// <summary>
        /// Reads a boolean AppConfig key. Defaults to <c>true</c> when the row is absent
        /// or unparsable — checkout/check-in must not silently disable themselves.
        /// </summary>
        public static bool GetBoolDefaultTrue(IOrganizationService service, string key)
        {
            string raw = GetValue(service, key);
            if (string.IsNullOrWhiteSpace(raw)) return true;
            bool v;
            return !bool.TryParse(raw, out v) || v;
        }

        /// <summary>
        /// Resolves per-taxonomy checkout/check-in AppConfig keys
        /// (docs/drawing-document-subtype-CONTRACT.md). Legacy rows with null
        /// reservation type/subtype behave as Drawing.
        /// </summary>
        public static class TaxonomyCheckoutConfig
        {
            public static bool IsCheckoutEnabled(
                IOrganizationService service,
                int? reservationType,
                int? documentSubtype)
                => GetBoolDefaultTrue(service, ResolveCheckoutKey(reservationType, documentSubtype));

            public static bool IsCheckInEnabled(
                IOrganizationService service,
                int? reservationType,
                int? documentSubtype)
                => GetBoolDefaultTrue(service, ResolveCheckInKey(reservationType, documentSubtype));

            private static string ResolveCheckoutKey(int? reservationType, int? documentSubtype)
            {
                if (reservationType == TaxonomyConstants.ReservationType.Drawing
                    && documentSubtype == TaxonomyConstants.DocumentSubtype.DrawingDocument)
                    return "EnableDrawingDocumentCheckout";

                if (reservationType == TaxonomyConstants.ReservationType.Document)
                {
                    if (documentSubtype == TaxonomyConstants.DocumentSubtype.Standard) return "EnableStandardCheckout";
                    if (documentSubtype == TaxonomyConstants.DocumentSubtype.Procedure) return "EnableProcedureCheckout";
                    if (documentSubtype == TaxonomyConstants.DocumentSubtype.Form) return "EnableFormCheckout";
                }
                return "EnableDrawingCheckout";
            }

            private static string ResolveCheckInKey(int? reservationType, int? documentSubtype)
            {
                if (reservationType == TaxonomyConstants.ReservationType.Drawing
                    && documentSubtype == TaxonomyConstants.DocumentSubtype.DrawingDocument)
                    return "EnableDrawingDocumentCheckIn";

                if (reservationType == TaxonomyConstants.ReservationType.Document)
                {
                    if (documentSubtype == TaxonomyConstants.DocumentSubtype.Standard) return "EnableStandardCheckIn";
                    if (documentSubtype == TaxonomyConstants.DocumentSubtype.Procedure) return "EnableProcedureCheckIn";
                    if (documentSubtype == TaxonomyConstants.DocumentSubtype.Form) return "EnableFormCheckIn";
                }
                return "EnableDrawingCheckIn";
            }
        }

        /// <summary>
        /// Resolves SharePoint drop-off/destination library URLs by reservation TYPE only
        /// (docs/drawing-document-subtype-CONTRACT.md) — Drawing (incl. Drawing Document)
        /// uses the Drawing* pair; Document (Standard/Procedure/Form) uses the Document*
        /// pair. Fallback chain: type key → legacy plural Drawings*/Documents* key → (Document
        /// only) old subtype-specific key from the pre-remap taxonomy → (drop-off only)
        /// CheckInUploadLibraryUrl. Mirrors the TypeScript resolveLibraryUrls in
        /// code-app/src/features/sharepoint/sharepointUrls.ts.
        /// </summary>
        public static class TaxonomyLibraryConfig
        {
            public static string ResolveDropOffKey(int? reservationType)
                => reservationType == TaxonomyConstants.ReservationType.Document
                    ? "DocumentDropOffLibraryUrl"
                    : "DrawingDropOffLibraryUrl";

            public static string ResolveDestinationKey(int? reservationType)
                => reservationType == TaxonomyConstants.ReservationType.Document
                    ? "DocumentDestinationLibraryUrl"
                    : "DrawingDestinationLibraryUrl";

            private static string LegacyDropOffKey(int? reservationType)
                => reservationType == TaxonomyConstants.ReservationType.Document
                    ? "DocumentsDropOffLibraryUrl"
                    : "DrawingsDropOffLibraryUrl";

            private static string LegacyDestinationKey(int? reservationType)
                => reservationType == TaxonomyConstants.ReservationType.Document
                    ? "DocumentsDestinationLibraryUrl"
                    : "DrawingsDestinationLibraryUrl";

            /// <summary>Pre-remap per-subtype keys, retained as a final fallback for Document during cutover.</summary>
            private static string OldSubtypeDropOffKey(int? reservationType, int? documentSubtype)
            {
                if (reservationType != TaxonomyConstants.ReservationType.Document) return null;
                if (documentSubtype == TaxonomyConstants.DocumentSubtype.Standard) return "StandardDocumentDropOffLibraryUrl";
                if (documentSubtype == TaxonomyConstants.DocumentSubtype.Procedure) return "ProcedureDocumentDropOffLibraryUrl";
                if (documentSubtype == TaxonomyConstants.DocumentSubtype.Form) return "FormDocumentDropOffLibraryUrl";
                return null;
            }

            /// <summary>Pre-remap per-subtype keys, retained as a final fallback for Document during cutover.</summary>
            private static string OldSubtypeDestinationKey(int? reservationType, int? documentSubtype)
            {
                if (reservationType != TaxonomyConstants.ReservationType.Document) return null;
                if (documentSubtype == TaxonomyConstants.DocumentSubtype.Standard) return "StandardDocumentDestinationLibraryUrl";
                if (documentSubtype == TaxonomyConstants.DocumentSubtype.Procedure) return "ProcedureDocumentDestinationLibraryUrl";
                if (documentSubtype == TaxonomyConstants.DocumentSubtype.Form) return "FormDocumentDestinationLibraryUrl";
                return null;
            }

            public static string GetDropOffUrl(IOrganizationService service, int? reservationType, int? documentSubtype)
            {
                string typeKey = GetValue(service, ResolveDropOffKey(reservationType));
                if (!string.IsNullOrWhiteSpace(typeKey)) return typeKey;

                string legacy = GetValue(service, LegacyDropOffKey(reservationType));
                if (!string.IsNullOrWhiteSpace(legacy)) return legacy;

                string oldSubtypeKey = OldSubtypeDropOffKey(reservationType, documentSubtype);
                if (oldSubtypeKey != null)
                {
                    string oldSubtype = GetValue(service, oldSubtypeKey);
                    if (!string.IsNullOrWhiteSpace(oldSubtype)) return oldSubtype;
                }

                return GetValue(service, "CheckInUploadLibraryUrl");
            }

            public static string GetDestinationUrl(IOrganizationService service, int? reservationType, int? documentSubtype)
            {
                string typeKey = GetValue(service, ResolveDestinationKey(reservationType));
                if (!string.IsNullOrWhiteSpace(typeKey)) return typeKey;

                string legacy = GetValue(service, LegacyDestinationKey(reservationType));
                if (!string.IsNullOrWhiteSpace(legacy)) return legacy;

                string oldSubtypeKey = OldSubtypeDestinationKey(reservationType, documentSubtype);
                return oldSubtypeKey != null ? GetValue(service, oldSubtypeKey) : null;
            }
        }
    }
}
