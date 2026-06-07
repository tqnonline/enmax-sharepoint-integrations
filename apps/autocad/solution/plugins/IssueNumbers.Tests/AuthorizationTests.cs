using System;
using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class AuthorizationTests
    {
        private static readonly Guid AdminTeamId    = Guid.NewGuid();
        private static readonly Guid ApproverTeamId = Guid.NewGuid();

        /// <summary>
        /// Builds a context with AdminTeamId and ApproverTeamId in App Configuration,
        /// optionally seeding team memberships.
        /// </summary>
        private static XrmFakedContext BuildContext(
            Guid? adminMember    = null,
            Guid? approverMember = null)
        {
            var ctx = new XrmFakedContext();
            var seed = new System.Collections.Generic.List<Entity>
            {
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "AdminTeamId",
                    ["enmax_acdnvalue"] = AdminTeamId.ToString(),
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "ApproverTeamId",
                    ["enmax_acdnvalue"] = ApproverTeamId.ToString(),
                },
            };

            if (adminMember.HasValue)
                seed.Add(new Entity("teammembership", Guid.NewGuid())
                {
                    ["teamid"]       = AdminTeamId,
                    ["systemuserid"] = adminMember.Value,
                });

            if (approverMember.HasValue)
                seed.Add(new Entity("teammembership", Guid.NewGuid())
                {
                    ["teamid"]       = ApproverTeamId,
                    ["systemuserid"] = approverMember.Value,
                });

            ctx.Initialize(seed);
            return ctx;
        }

        // ── (a) IsAdmin true only for Admin-team member ───────────────────────

        [Fact]
        public void IsAdmin_AdminTeamMember_ReturnsTrue()
        {
            var userId = Guid.NewGuid();
            var ctx    = BuildContext(adminMember: userId);
            var svc    = ctx.GetFakedOrganizationService();

            Authorization.IsAdmin(svc, userId).Should().BeTrue();
        }

        [Fact]
        public void IsAdmin_NonMember_ReturnsFalse()
        {
            var userId    = Guid.NewGuid();
            var otherUser = Guid.NewGuid();
            var ctx       = BuildContext(adminMember: otherUser);
            var svc       = ctx.GetFakedOrganizationService();

            Authorization.IsAdmin(svc, userId).Should().BeFalse();
        }

        // ── (b) RequireApproverOrAdmin throws for a plain user ────────────────

        [Fact]
        public void RequireApproverOrAdmin_PlainUser_Throws()
        {
            var userId = Guid.NewGuid();
            var ctx    = BuildContext(); // no memberships seeded
            var svc    = ctx.GetFakedOrganizationService();

            Action act = () => Authorization.RequireApproverOrAdmin(svc, userId, "perform this action");

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*You are not authorized*");
        }

        // ── (c) RequireApproverOrAdmin passes for an approver ─────────────────

        [Fact]
        public void RequireApproverOrAdmin_ApproverMember_DoesNotThrow()
        {
            var userId = Guid.NewGuid();
            var ctx    = BuildContext(approverMember: userId);
            var svc    = ctx.GetFakedOrganizationService();

            Action act = () => Authorization.RequireApproverOrAdmin(svc, userId, "perform this action");

            act.Should().NotThrow();
        }

        // ── (e) System roles — IsAdmin true for System Administrator / System Customizer ──────────

        /// <summary>
        /// A user linked via systemuserroles to a role named "System Administrator"
        /// must be treated as admin even with no AdminTeam configured.
        /// </summary>
        [Fact]
        public void IsAdmin_true_for_system_administrator_role()
        {
            var userId = Guid.NewGuid();
            var roleId = Guid.NewGuid();

            // Empty context — no AdminTeamId in App Config, so team path returns false.
            var ctx  = new XrmFakedContext();
            var seed = new System.Collections.Generic.List<Entity>
            {
                new Entity("role", roleId)
                {
                    ["roleid"] = roleId,
                    ["name"]   = "System Administrator",
                },
                new Entity("systemuserroles", Guid.NewGuid())
                {
                    ["roleid"]       = roleId,
                    ["systemuserid"] = userId,
                },
            };
            ctx.Initialize(seed);

            var svc = ctx.GetFakedOrganizationService();

            Authorization.IsAdmin(svc, userId).Should().BeTrue(
                because: "a System Administrator role holder must be recognised as admin");
        }

        /// <summary>
        /// A user with neither admin-team membership nor a system role must return false.
        /// </summary>
        [Fact]
        public void IsAdmin_false_for_user_with_no_team_and_no_sysrole()
        {
            var ctx  = new XrmFakedContext(); // no seed at all
            var svc  = ctx.GetFakedOrganizationService();
            var userId = Guid.NewGuid();

            Authorization.IsAdmin(svc, userId).Should().BeFalse(
                because: "neither team membership nor system role means fail-closed → false");
        }

        // ── (d) FAIL-CLOSED: no AppConfig/membership → IsAdmin false, RequireAdmin throws ─────────

        [Fact]
        public void IsAdmin_NoAppConfig_ReturnsFalse_FailClosed()
        {
            var ctx    = new XrmFakedContext(); // no seed at all
            var svc    = ctx.GetFakedOrganizationService();
            var userId = Guid.NewGuid();

            Authorization.IsAdmin(svc, userId).Should().BeFalse(
                because: "missing config must be treated as not-a-member (fail-closed)");
        }

        [Fact]
        public void RequireAdmin_NoAppConfig_Throws_FailClosed()
        {
            var ctx    = new XrmFakedContext(); // no seed at all
            var svc    = ctx.GetFakedOrganizationService();
            var userId = Guid.NewGuid();

            Action act = () => Authorization.RequireAdmin(svc, userId, "do the thing");

            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*You are not authorized*",
                   because: "fail-closed: absent config must deny access");
        }
    }
}
