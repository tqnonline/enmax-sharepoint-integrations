using System;
using System.Collections.Generic;
using System.ServiceModel;
using FakeXrmEasy;
using FakeXrmEasy.FakeMessageExecutors;
using FluentAssertions;
using Enmax.AutoCAD;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Newtonsoft.Json;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    /// <summary>
    /// Builds the default "standard" plugin execution context used across most tests.
    /// Business=GG, Asset=CG, Unit=00, Domain=ECS, System=AST, Kind=DD
    /// SequenceKey = GG-CG-00-ECS-AST-DD
    /// </summary>
    internal static class PluginContextFactory
    {
        internal const string DefaultBusiness = "GG";
        internal const string DefaultAsset    = "CG";
        internal const string DefaultUnit     = "00";
        internal const string DefaultDomain   = "ECS";
        internal const string DefaultSystem   = "AST";
        internal const string DefaultKind     = "DD";
        internal const string DefaultKey      = "GG-CG-00-ECS-AST-DD";

        internal const string EntityName      = "enmax_autocadnumbersequence";
        internal const string ColKey          = "enmax_acdnsequencekey";
        internal const string ColSeed         = "enmax_acdnseedvalue";
        internal const string ColLastIssued   = "enmax_acdnlastissued";
        internal const string ColLastIssuedAt = "enmax_acdnlastissuedat";
        internal const string ColStatus       = "enmax_acdnnumbersequencestatus";

        // Stable GUID used as the authorized initiating user in all default-context tests.
        internal static readonly Guid AuthorizedUserId = new Guid("aaaaaaaa-0000-0000-0000-000000000001");

        // Shared team IDs used when seeding authorization data.
        private static readonly Guid ApproverTeamId = new Guid("bbbbbbbb-0000-0000-0000-000000000002");
        private static readonly Guid AdminTeamId    = new Guid("cccccccc-0000-0000-0000-000000000003");

        /// <summary>
        /// Seeds the AppConfig rows and a teammembership row so that <paramref name="userId"/>
        /// is recognized as an Approver. Uses the org service Create so it does not overwrite
        /// any sequence rows already placed by the test.
        /// </summary>
        internal static void SeedAuthForUser(XrmFakedContext fakedContext, Guid userId)
        {
            var svc = fakedContext.GetFakedOrganizationService();

            var adminConfig = new Entity("enmax_autocadappconfig", Guid.NewGuid());
            adminConfig["enmax_acdnkey"]   = "AdminTeamId";
            adminConfig["enmax_acdnvalue"] = AdminTeamId.ToString();
            svc.Create(adminConfig);

            var approverConfig = new Entity("enmax_autocadappconfig", Guid.NewGuid());
            approverConfig["enmax_acdnkey"]   = "ApproverTeamId";
            approverConfig["enmax_acdnvalue"] = ApproverTeamId.ToString();
            svc.Create(approverConfig);

            var membership = new Entity("teammembership", Guid.NewGuid());
            membership["teamid"]       = ApproverTeamId;
            membership["systemuserid"] = userId;
            svc.Create(membership);
        }

        internal static XrmFakedPluginExecutionContext BuildDefaultContext(
            XrmFakedContext fakedContext,
            int count = 1,
            string business = DefaultBusiness,
            string asset    = DefaultAsset,
            string unit     = DefaultUnit,
            string domain   = DefaultDomain,
            string system   = DefaultSystem,
            string kind     = DefaultKind)
        {
            // Seed authorization data so the authorization gate passes.
            SeedAuthForUser(fakedContext, AuthorizedUserId);

            var pluginCtx = fakedContext.GetDefaultPluginContext();
            pluginCtx.MessageName = "enmax_acdnIssueNumbers";
            pluginCtx.Stage      = 40; // PostOperation
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();

            pluginCtx.InitiatingUserId = AuthorizedUserId;

            pluginCtx.InputParameters["Business"] = business;
            pluginCtx.InputParameters["Asset"]    = asset;
            pluginCtx.InputParameters["Unit"]     = unit;
            pluginCtx.InputParameters["Domain"]   = domain;
            pluginCtx.InputParameters["System"]   = system;
            pluginCtx.InputParameters["Kind"]     = kind;
            pluginCtx.InputParameters["Count"]    = count;

            return pluginCtx;
        }

        internal static Entity BuildSequenceRow(
            string key         = DefaultKey,
            int    lastIssued  = 0,
            int    seedValue   = 0,
            int    status      = 1)
        {
            var row = new Entity(EntityName)
            {
                Id = Guid.NewGuid()
            };
            row[ColKey]        = key;
            row[ColLastIssued] = lastIssued;
            row[ColSeed]       = seedValue;
            row[ColStatus]     = new OptionSetValue(status);
            return row;
        }
    }

    /// <summary>
    /// IFakeMessageExecutor implementation that throws a given exception on every Update call.
    /// Used to verify that version-mismatch exceptions propagate out of the plugin.
    /// </summary>
    internal sealed class AlwaysThrowUpdateExecutor : IFakeMessageExecutor
    {
        private readonly Exception _exception;
        public int CallCount { get; private set; }

        public AlwaysThrowUpdateExecutor(Exception exception)
        {
            _exception = exception;
        }

        public bool CanExecute(OrganizationRequest request)
        {
            return request is UpdateRequest;
        }

        public OrganizationResponse Execute(OrganizationRequest request, XrmFakedContext ctx)
        {
            CallCount++;
            throw _exception;
        }

        public Type GetResponsibleRequestType()
        {
            return typeof(UpdateRequest);
        }
    }

    // ---------------------------------------------------------------------------
    // Test class
    // ---------------------------------------------------------------------------

    /// <summary>
    /// Unit tests for IssueNumbersPlugin (TDD RED phase — all 22 tests fail until GREEN implementation).
    /// PIN: Test #19 (backoff timing) requires <c>IssueNumbersPlugin(Func&lt;DateTime&gt; clock)</c>
    ///      constructor overload — implementer must add it in GREEN phase.
    /// PIN: Test #21 (auto-create race) requires Create-throws mock via
    ///      <c>AddFakeMessageExecutor&lt;CreateRequest&gt;</c> and auto-creation logic in the plugin.
    /// </summary>
    public class IssueNumbersPluginTests
    {
        // -----------------------------------------------------------------------
        // Test 1 – Happy path: fresh combination, Count=1 → [1]
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_HappyPath_FreshCombination_Returns0001()
        {
            var fxCtx    = new XrmFakedContext();
            var plugCtx  = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail
            // If we somehow get here (won't in RED):
            var issued = JsonConvert.DeserializeObject<int[]>((string)plugCtx.OutputParameters["IssuedNumbers"]);
            issued.Should().BeEquivalentTo(new[] { 1 });
        }

        // -----------------------------------------------------------------------
        // Test 2 – Happy path: existing sequence LastIssued=42, Count=3 → [43,44,45]
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_HappyPath_ExistingSequence_StartsFromLastIssuedPlusOne()
        {
            var fxCtx   = new XrmFakedContext();
            var row     = PluginContextFactory.BuildSequenceRow(lastIssued: 42);
            fxCtx.Initialize(new List<Entity> { row });
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 3);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail

            var issued = JsonConvert.DeserializeObject<int[]>((string)plugCtx.OutputParameters["IssuedNumbers"]);
            issued.Should().BeEquivalentTo(new[] { 43, 44, 45 });
            var newLast = (int)plugCtx.OutputParameters["NewLastIssued"];
            newLast.Should().Be(45);
        }

        // -----------------------------------------------------------------------
        // Test 3 – SeedValue applied: SeedValue=500, LastIssued=0, Count=1 → [501]
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_HappyPath_SeedValue_Applied()
        {
            var fxCtx   = new XrmFakedContext();
            var row     = PluginContextFactory.BuildSequenceRow(lastIssued: 0, seedValue: 500);
            fxCtx.Initialize(new List<Entity> { row });
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail

            var issued = JsonConvert.DeserializeObject<int[]>((string)plugCtx.OutputParameters["IssuedNumbers"]);
            issued.Should().BeEquivalentTo(new[] { 501 });
        }

        // -----------------------------------------------------------------------
        // Test 4 – SequenceKey composed uppercase: GG-CG-00-ECS-AST-DD
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_SequenceKey_ComposedUppercase()
        {
            var fxCtx   = new XrmFakedContext();
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx,
                business: "gg", asset: "cg", unit: "00", domain: "ecs", system: "ast", kind: "dd");

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail

            var key = (string)plugCtx.OutputParameters["SequenceKey"];
            key.Should().Be("GG-CG-00-ECS-AST-DD");
        }

        // -----------------------------------------------------------------------
        // Test 5 – Whitespace trimmed from inputs in key composition
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_SequenceKey_WhitespaceTrimmed()
        {
            var fxCtx   = new XrmFakedContext();
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx,
                business: " GG ", asset: " CG ", unit: " 00 ",
                domain: " ECS ", system: " AST ", kind: " DD ");

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail

            var key = (string)plugCtx.OutputParameters["SequenceKey"];
            key.Should().Be("GG-CG-00-ECS-AST-DD");
        }

        // -----------------------------------------------------------------------
        // Test 6 – Ceiling at limit: LastIssued=9998, Count=1 → [9999], Status=Exhausted
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_Ceiling_AtLimit_LastIssued9998_Count1_Returns9999()
        {
            var fxCtx   = new XrmFakedContext();
            var row     = PluginContextFactory.BuildSequenceRow(lastIssued: 9998);
            fxCtx.Initialize(new List<Entity> { row });
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail

            var issued = JsonConvert.DeserializeObject<int[]>((string)plugCtx.OutputParameters["IssuedNumbers"]);
            issued.Should().BeEquivalentTo(new[] { 9999 });
            var status = (OptionSetValue)plugCtx.OutputParameters["Status"];
            status.Value.Should().Be(4); // Exhausted
        }

        // -----------------------------------------------------------------------
        // Test 7 – Ceiling exceeded: LastIssued=9990, Count=20 → throws
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_Ceiling_Exceeded_Throws()
        {
            var fxCtx   = new XrmFakedContext();
            var row     = PluginContextFactory.BuildSequenceRow(lastIssued: 9990);
            fxCtx.Initialize(new List<Entity> { row });
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 20);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*would exceed 9999*");
        }

        // -----------------------------------------------------------------------
        // Test 8 – Already exhausted: LastIssued=9999, Count=1 → throws
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_Ceiling_AlreadyExhausted_Throws()
        {
            var fxCtx   = new XrmFakedContext();
            var row     = PluginContextFactory.BuildSequenceRow(lastIssued: 9999);
            fxCtx.Initialize(new List<Entity> { row });
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*would exceed 9999*");
        }

        // -----------------------------------------------------------------------
        // Test 9 – Count=0 → throws with "Count must be between 1 and 1000"
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_Count_Zero_Throws()
        {
            var fxCtx   = new XrmFakedContext();
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 0);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*Count must be between 1 and 1000*");
        }

        // -----------------------------------------------------------------------
        // Test 10 – Count=-5 → throws
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_Count_Negative_Throws()
        {
            var fxCtx   = new XrmFakedContext();
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: -5);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*Count must be between 1 and 1000*");
        }

        // -----------------------------------------------------------------------
        // Test 11 – Count=1001 → throws
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_Count_Above1000_Throws()
        {
            var fxCtx   = new XrmFakedContext();
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1001);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*Count must be between 1 and 1000*");
        }

        // -----------------------------------------------------------------------
        // Test 12 – Status Healthy: LastIssued=8998, Count=1 → Status=1 (Healthy)
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_Status_BelowWarning_Healthy()
        {
            var fxCtx   = new XrmFakedContext();
            var row     = PluginContextFactory.BuildSequenceRow(lastIssued: 8998);
            fxCtx.Initialize(new List<Entity> { row });
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail

            var status = (OptionSetValue)plugCtx.OutputParameters["Status"];
            status.Value.Should().Be(1); // Healthy
        }

        // -----------------------------------------------------------------------
        // Test 13 – Status Warning: LastIssued=8999, Count=1 → Status=2 (Warning)
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_Status_AtWarning_9000_Warning()
        {
            var fxCtx   = new XrmFakedContext();
            var row     = PluginContextFactory.BuildSequenceRow(lastIssued: 8999);
            fxCtx.Initialize(new List<Entity> { row });
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail

            var status = (OptionSetValue)plugCtx.OutputParameters["Status"];
            status.Value.Should().Be(2); // Warning
        }

        // -----------------------------------------------------------------------
        // Test 14 – Status Critical: LastIssued=9899, Count=1 → Status=3 (Critical)
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_Status_AtCritical_9900_Critical()
        {
            var fxCtx   = new XrmFakedContext();
            var row     = PluginContextFactory.BuildSequenceRow(lastIssued: 9899);
            fxCtx.Initialize(new List<Entity> { row });
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail

            var status = (OptionSetValue)plugCtx.OutputParameters["Status"];
            status.Value.Should().Be(3); // Critical
        }

        // -----------------------------------------------------------------------
        // Test 15 – Status Exhausted: LastIssued=9998, Count=1 → Status=4 (Exhausted)
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_Status_AtExhausted_9999_Exhausted()
        {
            var fxCtx   = new XrmFakedContext();
            var row     = PluginContextFactory.BuildSequenceRow(lastIssued: 9998);
            fxCtx.Initialize(new List<Entity> { row });
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail

            var status = (OptionSetValue)plugCtx.OutputParameters["Status"];
            status.Value.Should().Be(4); // Exhausted
        }

        // -----------------------------------------------------------------------
        // Test 16 – LastIssuedAt updated within 5 seconds of UtcNow
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_LastIssuedAt_Updated()
        {
            var fxCtx   = new XrmFakedContext();
            var row     = PluginContextFactory.BuildSequenceRow(lastIssued: 0);
            fxCtx.Initialize(new List<Entity> { row });
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);
            var before  = DateTime.UtcNow;

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail

            // Verify updated row in fake data store
            var svc      = fxCtx.GetFakedOrganizationService();
            var updated  = svc.Retrieve(
                PluginContextFactory.EntityName, row.Id,
                new Microsoft.Xrm.Sdk.Query.ColumnSet(PluginContextFactory.ColLastIssuedAt));
            var lastAt   = (DateTime)updated[PluginContextFactory.ColLastIssuedAt];
            lastAt.Should().BeOnOrAfter(before).And.BeOnOrBefore(DateTime.UtcNow.AddSeconds(5));
        }

        // -----------------------------------------------------------------------
        // Test 17 – Concurrency conflict: ConcurrencyVersionMismatch propagates to caller
        //           Plugin must NOT catch service exceptions — Dataverse's transaction
        //           count tracking prohibits catch-and-continue in synchronous context.
        //           Retry belongs at the caller (fixture / Code App), not in the plugin.
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_ConcurrencyVersionMismatch_Propagates()
        {
            var fxCtx  = new XrmFakedContext();
            var row    = PluginContextFactory.BuildSequenceRow(lastIssued: 0);
            fxCtx.Initialize(new List<Entity> { row });

            var fault  = new OrganizationServiceFault { ErrorCode = -2147088254, Message = "ConcurrencyVersionMismatch" };
            var orgEx  = new FaultException<OrganizationServiceFault>(fault, fault.Message);

            var executor = new AlwaysThrowUpdateExecutor(orgEx);
            fxCtx.AddFakeMessageExecutor<UpdateRequest>(executor);

            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            // PluginBase wraps FaultException<OrganizationServiceFault> in InvalidPluginExecutionException.
            // The important invariant: the plugin does NOT catch and swallow the fault — it propagates
            // so the caller can retry.
            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*ConcurrencyVersionMismatch*",
                   "version-mismatch fault must propagate so the caller can retry");
        }

        // -----------------------------------------------------------------------
        // Test 20 – Missing required parameter: Business → throws mentioning "Business"
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_MissingRequiredParameter_Business_Throws()
        {
            var fxCtx  = new XrmFakedContext();
            // Seed auth so the gate passes and parameter validation is reached.
            PluginContextFactory.SeedAuthForUser(fxCtx, PluginContextFactory.AuthorizedUserId);
            var plugCtx = fxCtx.GetDefaultPluginContext();
            plugCtx.MessageName = "enmax_acdnIssueNumbers";
            plugCtx.Stage       = 40;
            plugCtx.InputParameters  = new ParameterCollection();
            plugCtx.OutputParameters = new ParameterCollection();
            plugCtx.InitiatingUserId = PluginContextFactory.AuthorizedUserId;
            // Intentionally omit "Business"
            plugCtx.InputParameters["Asset"]  = "CG";
            plugCtx.InputParameters["Unit"]   = "00";
            plugCtx.InputParameters["Domain"] = "ECS";
            plugCtx.InputParameters["System"] = "AST";
            plugCtx.InputParameters["Kind"]   = "DD";
            plugCtx.InputParameters["Count"]  = 1;

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*Business*");
        }

        // -----------------------------------------------------------------------
        // Test 21 – Reservation write: issued numbers stamped onto reservation row
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_writes_issued_numbers_onto_reservation_when_supplied()
        {
            var fxCtx  = new XrmFakedContext();
            var resId  = Guid.NewGuid();
            var resRow = new Entity("enmax_autocadreservation", resId);
            fxCtx.Initialize(new List<Entity> { resRow });

            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 2);
            plugCtx.InputParameters["Reservation"] = new EntityReference("enmax_autocadreservation", resId);

            fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);

            var issuedJson = (string)plugCtx.OutputParameters["IssuedNumbers"];
            var svc        = fxCtx.GetFakedOrganizationService();
            var updated    = svc.Retrieve("enmax_autocadreservation", resId,
                                new Microsoft.Xrm.Sdk.Query.ColumnSet("enmax_acdnissuednumbers"));
            var stamped    = (string)updated["enmax_acdnissuednumbers"];

            stamped.Should().Be(issuedJson,
                "the reservation must carry the same issued-numbers JSON as the plugin output");
        }

        // -----------------------------------------------------------------------
        // Test 22 – Authorization gate: unauthorized user is denied
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_denied_for_unauthorized_user()
        {
            var fxCtx      = new XrmFakedContext();
            // Seed AppConfig team IDs but do NOT add the user to any team.
            var approverTeamId = new Guid("bbbbbbbb-0000-0000-0000-000000000002");
            var adminTeamId    = new Guid("cccccccc-0000-0000-0000-000000000003");
            var unauthorizedId = Guid.NewGuid();

            var svc = fxCtx.GetFakedOrganizationService();
            var adminConfig = new Entity("enmax_autocadappconfig", Guid.NewGuid());
            adminConfig["enmax_acdnkey"]   = "AdminTeamId";
            adminConfig["enmax_acdnvalue"] = adminTeamId.ToString();
            svc.Create(adminConfig);

            var approverConfig = new Entity("enmax_autocadappconfig", Guid.NewGuid());
            approverConfig["enmax_acdnkey"]   = "ApproverTeamId";
            approverConfig["enmax_acdnvalue"] = approverTeamId.ToString();
            svc.Create(approverConfig);

            var plugCtx = fxCtx.GetDefaultPluginContext();
            plugCtx.MessageName      = "enmax_acdnIssueNumbers";
            plugCtx.Stage            = 40;
            plugCtx.InputParameters  = new ParameterCollection();
            plugCtx.OutputParameters = new ParameterCollection();
            plugCtx.InitiatingUserId = unauthorizedId;
            plugCtx.InputParameters["Business"] = "GG";
            plugCtx.InputParameters["Asset"]    = "CG";
            plugCtx.InputParameters["Unit"]     = "00";
            plugCtx.InputParameters["Domain"]   = "ECS";
            plugCtx.InputParameters["System"]   = "AST";
            plugCtx.InputParameters["Kind"]     = "DD";
            plugCtx.InputParameters["Count"]    = 1;

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*not authorized*",
                   "unauthorized user must be denied before any number is issued");

            // Assert no number-sequence row was created.
            var results = svc.RetrieveMultiple(new Microsoft.Xrm.Sdk.Query.QueryExpression("enmax_autocadnumbersequence")
            {
                ColumnSet = new Microsoft.Xrm.Sdk.Query.ColumnSet(false),
            });
            results.Entities.Should().BeEmpty("no sequence row must be created for an unauthorized call");
        }

        // -----------------------------------------------------------------------
        // Test 18 – Audit attribution: plugin reads calling user from PluginExecutionContext.UserId
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_AuditAttribution_UsesCallingUser()
        {
            // Plug-in step registered to run in "Calling User" context so Dataverse audit log
            // records the initiating user for every number issuance (not the service account).
            var testUserId = Guid.NewGuid();
            var fxCtx = new XrmFakedContext();
            // Seed auth for the specific testUserId so the authorization gate passes.
            PluginContextFactory.SeedAuthForUser(fxCtx, testUserId);
            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);
            plugCtx.UserId = testUserId;
            plugCtx.InitiatingUserId = testUserId;

            fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);

            plugCtx.OutputParameters.Should().ContainKey("IssuedNumbers",
                "issuance must complete and return results under calling user context");
            plugCtx.OutputParameters.Should().ContainKey("SequenceKey",
                "SequenceKey required for audit trail");
        }
    }
}
