using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Collections.Generic;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Writes in-app notification rows (enmax_autocadinappnotification). Flow-free replacement for the
    /// per-user fan-out previously done by Power Automate: a plug-in resolves recipients and creates the
    /// rows in the same transaction as the triggering action.
    ///
    /// Role-targeted notices (e.g. "a check-in needs validation") go to the members of the Admin + Approver
    /// teams. Team ids are read from App Configuration (keys AdminTeamId / ApproverTeamId) — the same source
    /// the Code App uses to resolve a user's role, so the audiences stay in lock-step.
    /// </summary>
    public static class NotificationWriter
    {
        private const string NotifEntity     = "enmax_autocadinappnotification";
        private const string AppConfigEntity = "enmax_autocadappconfig";
        private const string TeamMembership  = "teammembership";

        private const string ColKey   = "enmax_acdnkey";
        private const string ColValue = "enmax_acdnvalue";

        /// <summary>Create one in-app notification for a single recipient.</summary>
        public static void Create(
            IOrganizationService service, Guid recipientId,
            string title, string body, int severity, int sourceEvent,
            string subjectTable, string subjectId, string deepLinkPath)
        {
            service.Create(new Entity(NotifEntity)
            {
                ["enmax_acdntitle"]        = title,
                ["enmax_acdnbody"]         = body,
                ["enmax_acdnseverity"]     = new OptionSetValue(severity),
                ["enmax_acdnsourceevent"]  = new OptionSetValue(sourceEvent),
                ["enmax_acdnsubjecttable"] = subjectTable,
                ["enmax_acdnsubjectid"]    = subjectId,
                ["enmax_acdndeeplinkpath"] = deepLinkPath,
                ["enmax_acdnread"]         = false,
                ["enmax_acdnrecipient"]    = new EntityReference("systemuser", recipientId),
            });
        }

        /// <summary>Notify every Approver/Admin (minus the actor) with the same notification.</summary>
        public static void NotifyApproversAndAdmins(
            IOrganizationService service, Guid actorId,
            string title, string body, int severity, int sourceEvent,
            string subjectTable, string subjectId, string deepLinkPath)
        {
            foreach (var recipientId in GetApproverAndAdminUserIds(service, actorId))
                Create(service, recipientId, title, body, severity, sourceEvent, subjectTable, subjectId, deepLinkPath);
        }

        /// <summary>Display name of a user for notification bodies; falls back to "A user" if unavailable.</summary>
        public static string ResolveActorName(IOrganizationService service, Guid userId)
        {
            try
            {
                var user = service.Retrieve("systemuser", userId, new ColumnSet("fullname"));
                var name = user.GetAttributeValue<string>("fullname");
                if (!string.IsNullOrWhiteSpace(name)) return name;
            }
            catch { /* full name is cosmetic — fall back */ }
            return "A user";
        }

        /// <summary>Drawing number for notification bodies; falls back to the id if unavailable.</summary>
        public static string ResolveDrawingNumber(IOrganizationService service, Guid drawingId)
        {
            try
            {
                var d = service.Retrieve("enmax_autocaddrawing", drawingId, new ColumnSet("enmax_acdnnumber"));
                var n = d.GetAttributeValue<string>("enmax_acdnnumber");
                if (!string.IsNullOrWhiteSpace(n)) return n;
            }
            catch { /* number is cosmetic — fall back */ }
            return drawingId.ToString();
        }

        /// <summary>
        /// Distinct user ids that belong to the Admin and/or Approver teams (team ids read from App
        /// Configuration), excluding <paramref name="exclude"/> (typically the actor — they don't need to
        /// be told about their own action). Returns an empty list when the teams aren't configured.
        /// </summary>
        public static List<Guid> GetApproverAndAdminUserIds(IOrganizationService service, Guid exclude)
        {
            var result = new HashSet<Guid>();
            foreach (var key in new[] { "AdminTeamId", "ApproverTeamId" })
            {
                if (!Guid.TryParse(GetConfigValue(service, key), out var teamId)) continue;

                var q = new QueryExpression(TeamMembership) { ColumnSet = new ColumnSet("systemuserid") };
                q.Criteria.AddCondition("teamid", ConditionOperator.Equal, teamId);
                foreach (var member in service.RetrieveMultiple(q).Entities)
                {
                    var userId = member.GetAttributeValue<Guid>("systemuserid");
                    if (userId != Guid.Empty && userId != exclude) result.Add(userId);
                }
            }
            return new List<Guid>(result);
        }

        private static string GetConfigValue(IOrganizationService service, string key)
        {
            var q = new QueryExpression(AppConfigEntity) { ColumnSet = new ColumnSet(ColValue), TopCount = 1 };
            q.Criteria.AddCondition(ColKey, ConditionOperator.Equal, key);
            var r = service.RetrieveMultiple(q);
            return r.Entities.Count > 0 ? r.Entities[0].GetAttributeValue<string>(ColValue) : null;
        }
    }
}
