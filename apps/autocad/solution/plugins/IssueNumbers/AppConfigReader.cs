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
        /// Resolves per-taxonomy checkout/check-in AppConfig keys (ADR 0001).
        /// Legacy rows with null reservation type behave as Drawing.
        /// </summary>
        public static class TaxonomyCheckoutConfig
        {
            private const int ReservationTypeDrawing  = 1;
            private const int ReservationTypeDocument = 2;
            private const int DocumentSubtypeStandard = 1;
            private const int DocumentSubtypeProcedure = 2;
            private const int DocumentSubtypeForm = 3;

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
                if (reservationType == ReservationTypeDocument)
                {
                    if (documentSubtype == DocumentSubtypeStandard) return "EnableStandardCheckout";
                    if (documentSubtype == DocumentSubtypeProcedure) return "EnableProcedureCheckout";
                    if (documentSubtype == DocumentSubtypeForm) return "EnableFormCheckout";
                }
                return "EnableDrawingCheckout";
            }

            private static string ResolveCheckInKey(int? reservationType, int? documentSubtype)
            {
                if (reservationType == ReservationTypeDocument)
                {
                    if (documentSubtype == DocumentSubtypeStandard) return "EnableStandardCheckIn";
                    if (documentSubtype == DocumentSubtypeProcedure) return "EnableProcedureCheckIn";
                    if (documentSubtype == DocumentSubtypeForm) return "EnableFormCheckIn";
                }
                return "EnableDrawingCheckIn";
            }
        }
    }
}
