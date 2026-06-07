using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Extensions;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Writes an enmax_autocadauditevent row for Create / Update / Delete on any of the
    /// reference tables.
    ///
    /// Checkout / drawing-lifecycle audit is owned by the individual lifecycle plugins
    /// (CheckOut, SubmitRevision, ApproveCheckin, ForceCheckin, Finalize, MarkObsolete,
    /// ReleaseDrawing), which key every audit row to the DRAWING. This emitter therefore no
    /// longer handles enmax_autocadcheckout — doing so would double-write audit rows.
    ///
    /// Registered PostOperation Synchronous on each reference entity.
    /// </summary>
    public class AuditEmitter : PluginBase
    {
        // Option-set value matching enmax_autocadauditevent.enmax_acdnevent
        private const int EventReferenceDataChanged = 8;

        // Option-set value matching enmax_autocadauditevent.enmax_acdnsource
        private const int SourceAction = 4;

        private static readonly HashSet<string> ReferenceTableNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "enmax_autocadbusiness",
            "enmax_autocadasset",
            "enmax_autocadunit",
            "enmax_autocaddomain",
            "enmax_autocadsystem",
            "enmax_autocadkind",
            "enmax_autocadrecordtype",
            "enmax_autocadrecordphase",
            "enmax_autocadvendor",
            "enmax_autocadbusinessasset",
            "enmax_autocadassetunit",
            "enmax_autocadsystemscope",
        };

        public AuditEmitter() : base(typeof(AuditEmitter)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext ctx)
        {
            var pluginCtx = ctx.PluginExecutionContext;
            var orgSvc    = ctx.SystemUserService;

            var entity   = pluginCtx.PrimaryEntityName;
            var entityId = pluginCtx.PrimaryEntityId;
            var message  = pluginCtx.MessageName;

            if (!ReferenceTableNames.Contains(entity))
            {
                // Not an audited reference table (e.g. checkout/drawing — owned by lifecycle
                // plugins). Skip silently rather than fail the transaction.
                ctx.Trace($"AuditEmitter: entity '{entity}' is not an audited reference table, skipping.");
                return;
            }

            var auditRow = new Entity("enmax_autocadauditevent")
            {
                ["enmax_acdnsubjecttable"] = entity,
                ["enmax_acdnsubjectid"]    = entityId.ToString(),
                ["enmax_acdnevent"]        = new OptionSetValue(EventReferenceDataChanged),
                ["enmax_acdnreason"]       = BuildRefDataReason(message, entity, pluginCtx),
                ["enmax_acdnsource"]       = new OptionSetValue(SourceAction),
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", pluginCtx.InitiatingUserId),
            };

            orgSvc.Create(auditRow);
            ctx.Trace($"AuditEmitter: wrote reference-data audit event for {entity} {entityId}.");
        }

        private static string BuildRefDataReason(string message, string entity, IPluginExecutionContext ctx)
        {
            switch (message.ToUpperInvariant())
            {
                case "CREATE": return $"Reference data row created in {entity}.";
                case "UPDATE": return BuildUpdateReason(entity, ctx);
                case "DELETE": return $"Reference data row deleted from {entity}.";
                default:       return $"Reference data changed ({message}) in {entity}.";
            }
        }

        private static string BuildUpdateReason(string entity, IPluginExecutionContext ctx)
        {
            // Detect activate/deactivate via statecode change
            if (ctx.InputParameters.TryGetValue("Target", out var targetObj) && targetObj is Entity target)
            {
                if (target.Attributes.TryGetValue("statecode", out var stateObj))
                {
                    var stateVal = stateObj is OptionSetValue osv ? osv.Value : Convert.ToInt32(stateObj);
                    return stateVal == 0
                        ? $"Reference data row in {entity} activated."
                        : $"Reference data row in {entity} deactivated.";
                }
            }
            return $"Reference data row updated in {entity}.";
        }
    }
}
