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
    }
}
