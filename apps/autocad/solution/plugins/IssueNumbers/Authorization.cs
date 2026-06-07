using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Server-side authorization for custom actions. Resolves the caller's role from
    /// Admin/Approver team membership (team ids in App Configuration). FAIL-CLOSED:
    /// if the team config is missing/unparsable, membership is treated as false.
    /// Always pass a SYSTEM-context service (regular users cannot read teammembership).
    /// </summary>
    public static class Authorization
    {
        private const string TeamMembership = "teammembership";

        public static bool IsAdmin(IOrganizationService systemSvc, Guid userId)
            => IsInConfiguredTeam(systemSvc, userId, "AdminTeamId") || HasSystemRole(systemSvc, userId);

        public static bool IsApprover(IOrganizationService systemSvc, Guid userId)
            => IsInConfiguredTeam(systemSvc, userId, "ApproverTeamId");

        public static void RequireAdmin(IOrganizationService systemSvc, Guid userId, string action)
        {
            if (!IsAdmin(systemSvc, userId))
                throw new InvalidPluginExecutionException($"You are not authorized to {action}.");
        }

        public static void RequireApproverOrAdmin(IOrganizationService systemSvc, Guid userId, string action)
        {
            if (!IsApprover(systemSvc, userId) && !IsAdmin(systemSvc, userId))
                throw new InvalidPluginExecutionException($"You are not authorized to {action}.");
        }

        public static void RequireOwnerOrAdmin(IOrganizationService systemSvc, Guid ownerId, Guid userId, string action)
        {
            if (ownerId != userId && !IsAdmin(systemSvc, userId))
                throw new InvalidPluginExecutionException($"You are not authorized to {action}.");
        }

        public static void RequireSelf(Guid expectedUserId, Guid userId, string action)
        {
            if (expectedUserId != userId)
                throw new InvalidPluginExecutionException($"You are not authorized to {action}.");
        }

        /// <summary>
        /// Returns true if the user holds the "System Administrator" or "System Customizer"
        /// security role, matching the Code App's useUserRole.ts check by role name.
        /// Uses a link-entity from role → systemuserroles intersect filtered by systemuserid.
        /// </summary>
        private static bool HasSystemRole(IOrganizationService systemSvc, Guid userId)
        {
            var q = new QueryExpression("role")
            {
                ColumnSet = new ColumnSet(false),
                TopCount  = 1,
            };
            q.Criteria.AddCondition("name", ConditionOperator.In, "System Administrator", "System Customizer");
            var link = q.AddLink("systemuserroles", "roleid", "roleid");
            link.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            return systemSvc.RetrieveMultiple(q).Entities.Count > 0;
        }

        private static bool IsInConfiguredTeam(IOrganizationService systemSvc, Guid userId, string teamIdConfigKey)
        {
            if (!Guid.TryParse(AppConfigReader.GetValue(systemSvc, teamIdConfigKey), out var teamId))
                return false; // fail-closed: misconfigured => deny

            var q = new QueryExpression(TeamMembership)
            {
                ColumnSet = new ColumnSet("systemuserid"),
                TopCount  = 1,
            };
            q.Criteria.AddCondition("teamid", ConditionOperator.Equal, teamId);
            q.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            return systemSvc.RetrieveMultiple(q).Entities.Count > 0;
        }
    }
}
