using System;
using Microsoft.Xrm.Sdk;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// PreOperation Create: stamps ownerid = the enmax-autocad-app BU default team
    /// (id in App Configuration key AppOwnerTeamId) on shared/master/config tables,
    /// so they are owned by the BU team regardless of who creates them.
    /// FAIL-OPEN: if the key is missing/unparsable or the Target already has an
    /// owner, leave the create untouched (never block a write).
    /// </summary>
    public class SetAppOwnerPlugin : PluginBase
    {
        public SetAppOwnerPlugin() : base(typeof(SetAppOwnerPlugin)) { }
        public SetAppOwnerPlugin(string unsecure, string secure) : base(typeof(SetAppOwnerPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext ctx)
        {
            var pctx = ctx.PluginExecutionContext;
            if (!pctx.InputParameters.TryGetValue("Target", out var obj) || !(obj is Entity target))
                return;

            if (target.Contains("ownerid") && target["ownerid"] != null)
            {
                ctx.Trace("SetAppOwner: owner already set on Target — skipping.");
                return;
            }

            var value = AppConfigReader.GetValue(ctx.SystemUserService, "AppOwnerTeamId");
            if (!Guid.TryParse(value, out var teamId))
            {
                ctx.Trace("SetAppOwner: AppOwnerTeamId missing/unparsable — fail-open, leaving creator-owned.");
                return;
            }

            target["ownerid"] = new EntityReference("team", teamId);
            ctx.Trace($"SetAppOwner: stamped owner team {teamId} on {pctx.PrimaryEntityName}.");
        }
    }
}
