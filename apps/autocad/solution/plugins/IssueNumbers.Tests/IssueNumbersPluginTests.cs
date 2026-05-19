using System;
using System.Collections.Generic;
using System.ServiceModel;
using FakeXrmEasy;
using FakeXrmEasy.FakeMessageExecutors;
using FluentAssertions;
using IssueNumbers;
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
            var pluginCtx = fakedContext.GetDefaultPluginContext();
            pluginCtx.MessageName = "enmax_acdnIssueNumbers";
            pluginCtx.Stage      = 40; // PostOperation
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();

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
    /// IFakeMessageExecutor that throws a given exception on every Create call.
    /// Used to drive the auto-create race-lost path (DuplicateDetected).
    /// </summary>
    internal sealed class AlwaysThrowCreateExecutor : IFakeMessageExecutor
    {
        private readonly Exception _exception;

        public AlwaysThrowCreateExecutor(Exception exception)
        {
            _exception = exception;
        }

        public bool CanExecute(OrganizationRequest request)
        {
            return request is Microsoft.Xrm.Sdk.Messages.CreateRequest;
        }

        public OrganizationResponse Execute(OrganizationRequest request, XrmFakedContext ctx)
        {
            throw _exception;
        }

        public Type GetResponsibleRequestType()
        {
            return typeof(Microsoft.Xrm.Sdk.Messages.CreateRequest);
        }
    }

    /// <summary>
    /// IFakeMessageExecutor implementation that throws a given exception on every Update call.
    /// Used to drive retry-path tests.
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

    /// <summary>
    /// IFakeMessageExecutor that throws on the first N calls, then delegates to default behaviour.
    /// </summary>
    internal sealed class ThrowNThenSucceedUpdateExecutor : IFakeMessageExecutor
    {
        private readonly Exception _exception;
        private readonly int       _throwCount;
        public int CallCount { get; private set; }

        public ThrowNThenSucceedUpdateExecutor(Exception exception, int throwCount)
        {
            _exception  = exception;
            _throwCount = throwCount;
        }

        public bool CanExecute(OrganizationRequest request)
        {
            return request is UpdateRequest;
        }

        public OrganizationResponse Execute(OrganizationRequest request, XrmFakedContext ctx)
        {
            CallCount++;
            if (CallCount <= _throwCount)
                throw _exception;

            // Delegate to the default update logic: update entity in faked data store
            var updateReq = (UpdateRequest)request;
            ctx.GetFakedOrganizationService().Update(updateReq.Target);
            return new UpdateResponse();
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
        // Test 17 – Concurrency retry: 1st Update throws, 2nd succeeds → 2 Update calls
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_ConcurrencyVersionMismatch_RetriesOnce_Succeeds()
        {
            var fxCtx  = new XrmFakedContext();
            var row    = PluginContextFactory.BuildSequenceRow(lastIssued: 0);
            fxCtx.Initialize(new List<Entity> { row });

            // Build a concurrency fault
            var fault = new OrganizationServiceFault { ErrorCode = -2147088254, Message = "ConcurrencyVersionMismatch" };
            var orgEx = new FaultException<OrganizationServiceFault>(fault, fault.Message);

            var executor = new ThrowNThenSucceedUpdateExecutor(orgEx, throwCount: 1);
            fxCtx.AddFakeMessageExecutor<UpdateRequest>(executor);

            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow<NotImplementedException>("plugin must have real logic"); // will fail

            executor.CallCount.Should().Be(2);
            var issued = JsonConvert.DeserializeObject<int[]>((string)plugCtx.OutputParameters["IssuedNumbers"]);
            issued.Should().BeEquivalentTo(new[] { 1 });
        }

        // -----------------------------------------------------------------------
        // Test 18 – Concurrency retry: all 3 Updates throw → InvalidPluginExecutionException
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_ConcurrencyVersionMismatch_RetriesUpTo3Times_ThenThrows()
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
            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*Could not issue numbers after 3 retries*");
        }

        // -----------------------------------------------------------------------
        // Test 19 – Concurrency backoff: gaps between retries ≥ 100ms and 200ms
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_ConcurrencyVersionMismatch_BackoffApplied()
        {
            // Exponential backoff between retries prevents thundering herd under contention.
            // Verify the plugin requests delays of >= 100ms and >= 200ms between attempts.
            var sleepDelays = new List<int>();
            Action<int> fakeSleep = ms => sleepDelays.Add(ms);

            var fxCtx = new XrmFakedContext();
            var row = PluginContextFactory.BuildSequenceRow(lastIssued: 0);
            fxCtx.Initialize(new List<Entity> { row });

            var fault = new OrganizationServiceFault { ErrorCode = -2147088254, Message = "ConcurrencyVersionMismatch" };
            var orgEx = new FaultException<OrganizationServiceFault>(fault, fault.Message);
            var executor = new ThrowNThenSucceedUpdateExecutor(orgEx, throwCount: 2);
            fxCtx.AddFakeMessageExecutor<UpdateRequest>(executor);

            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            // Inject fake sleep via static override; reset after the call to avoid cross-test contamination
            IssueNumbersPlugin.SleepOverride = fakeSleep;
            try
            {
                fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            }
            finally
            {
                IssueNumbersPlugin.SleepOverride = null;
            }

            sleepDelays.Should().HaveCount(2, "two retries should sleep twice");
            sleepDelays[0].Should().BeGreaterOrEqualTo(100, "first backoff >= 100ms");
            sleepDelays[1].Should().BeGreaterOrEqualTo(200, "second backoff >= 200ms");
        }

        // -----------------------------------------------------------------------
        // Test 20 – Missing required parameter: Business → throws mentioning "Business"
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_MissingRequiredParameter_Business_Throws()
        {
            var fxCtx  = new XrmFakedContext();
            var plugCtx = fxCtx.GetDefaultPluginContext();
            plugCtx.MessageName = "enmax_acdnIssueNumbers";
            plugCtx.Stage       = 40;
            plugCtx.InputParameters  = new ParameterCollection();
            plugCtx.OutputParameters = new ParameterCollection();
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
        // Test 21 – Row auto-create race lost: Create throws DuplicateDetected → plugin retries Retrieve
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_RowAutoCreate_RaceLost_RetriesRetrieve()
        {
            // Auto-create race: two concurrent first-callers; our Create fails with DuplicateDetected
            // (ErrorCode 2147319761) because the other caller created the row first.
            // Plugin must catch DuplicateDetected and retry Retrieve to get the row.
            var fxCtx = new XrmFakedContext();

            // The "winner's" row already exists in the store (simulates the other caller's row)
            var competingRow = PluginContextFactory.BuildSequenceRow(lastIssued: 0);
            fxCtx.Initialize(new List<Entity> { competingRow });

            // Register Create-throws executor so our plugin's Create attempt fails with DuplicateDetected
            var duplicateFault = new OrganizationServiceFault { ErrorCode = 2147319761, Message = "DuplicateDetected" };
            var createEx = new FaultException<OrganizationServiceFault>(duplicateFault, duplicateFault.Message);
            fxCtx.AddFakeMessageExecutor<Microsoft.Xrm.Sdk.Messages.CreateRequest>(new AlwaysThrowCreateExecutor(createEx));

            var plugCtx = PluginContextFactory.BuildDefaultContext(fxCtx, count: 1);

            // Should NOT throw — plugin recovers from DuplicateDetected and uses the competitor's row
            Action act = () => fxCtx.ExecutePluginWith<IssueNumbersPlugin>(plugCtx);
            act.Should().NotThrow("plugin must recover from auto-create race via retry-retrieve");

            var issued = JsonConvert.DeserializeObject<int[]>((string)plugCtx.OutputParameters["IssuedNumbers"]);
            issued.Should().NotBeEmpty("issued numbers must come from the winning caller's row");
        }

        // -----------------------------------------------------------------------
        // Test 22 – Audit attribution: plugin reads calling user from PluginExecutionContext.UserId
        // -----------------------------------------------------------------------
        [Fact]
        public void Issue_AuditAttribution_UsesCallingUser()
        {
            // Plug-in step registered to run in "Calling User" context so Dataverse audit log
            // records the initiating user for every number issuance (not the service account).
            var testUserId = Guid.NewGuid();
            var fxCtx = new XrmFakedContext();
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
