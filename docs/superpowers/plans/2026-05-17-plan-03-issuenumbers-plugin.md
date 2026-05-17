# Plan #03 — IssueNumbers Custom Action + Plug-in (TDD)

**Date:** 2026-05-17
**Owner:** Engineering (Claude Code agent + one human reviewer: Rahul Akmol)
**Spec:** `2026-05-17-phase-1-cut-line-spec.md`
**PRD refs:** sections 9 (numbering scheme + concurrency), 10 (automation arch), 22 (seed strategy), 23 (test strategy)
**Decisions:** `2026-05-17-open-questions-decision-memo.md`
**Estimated effort:** 12–16 hours (TDD with retry/concurrency logic is the long pole)
**Branch:** `feat/003-issuenumbers-plugin` → PR to `dev`
**Blocked by:** Plan #02 merged to `dev` (Number Sequence table + Sequence Key alternate key must exist)

## Context

The IssueNumbers custom action is the load-bearing piece of the entire system. Per PRD section 9.3:

> This is the only correct way to do this on Dataverse. Issuing numbers from the client, or from a non-transactional flow step, will eventually duplicate. The custom action is the load-bearing piece; treat it as such in tests.

Per CLAUDE.md Rule 14 (added in plan #01):

> Number issuance must go through the Dataverse custom action backed by the plug-in. Never issue numbers from the client. Never issue numbers from a non-transactional flow. Tests must include a concurrent-request test that fires N parallel calls and asserts N distinct numbers.

A single regression in this plug-in silently breaks the system: numbers duplicate, drawings collide on ENMAX Number alternate key, audit log explodes with InvalidPluginExecutionException backtraces. Detection lag could be hours or days. This plan is TDD-mandatory. **Reviewer count: one (Rahul Akmol).** Project-specific override of the Rule 14 second-reviewer expectation, recorded 2026-05-17.

This plan does **not** include any Code App invocation of the custom action — the C# plug-in plus its registration is the deliverable. Plan #04+ wires the Code App and Power Automate flows to call it.

## Prerequisites

- Plan #02 merged to `dev`. Specifically:
  - `enmax_autocadnumbersequence` table exists with `enmax_acdnsequencekey` alternate key
  - All option sets exist (especially `enmax_acdn_numbersequencestatus` with Healthy/Warning/Critical/Exhausted codes)
- Plan #01 scaffold for `solution/plugins/IssueNumbers/` (csproj targeting net462, PluginBase.cs, .snk) merged to `dev`
- Dev tenant from runbook #003 accessible; service account has `prvCreateEntity`, `prvWriteEntity`, `prvReadEntity` on Number Sequence (the System Customizer role granted in runbook #001 covers this)
- PAC CLI authenticated to dev tenant
- Plug-in Registration Tool available (`pac tool prt`) — needed to register the assembly, custom action, and pipeline step

## Out of Scope for This Plan

- Code App invocation of the custom action (plan #04 — `useIssueNumbers` React Query mutation hook)
- Power Automate flow that triggers the custom action (the reservation-approval flow is in plan #05)
- Bulk-CSV import of legacy seed values (plan #02 ships the YAML path; CSV import UI is in plan #07 admin surfaces)
- Number-sequence exhaustion broadcast at 9900 threshold (the plug-in surfaces the Critical status; the broadcast trigger is a separate Power Automate scheduled flow in plan #08)
- Per-row seed-value edit UI (plan #07)

## Approach: TDD with FakeXrmEasy for Unit, Real Dataverse for Concurrency

Two-layer test architecture:

| Layer | Framework | What it covers | Where it runs |
|-------|-----------|----------------|---------------|
| **Unit** | xUnit + FakeXrmEasy | Plug-in logic: parameter parsing, sequence-key composition, increment math, ceiling enforcement, status computation, retry-on-version-mismatch behaviour | In-process; every PR via `ci.yml` |
| **Integration / Concurrency** | xUnit + real Dataverse Web API client | The PRD-mandated test: ≥50 parallel callers against a real dev-tenant sequence, asserts unique + contiguous + monotonically increasing | Nightly in `cd-dev.yml` against the dev tenant; on-demand via `workflow_dispatch` |

**Why xUnit:** most widely adopted .NET test framework for net462 in 2026, native parallel test runners (we need this for the concurrency test), Visual Studio + `dotnet test` first-class support, plays nicely with FakeXrmEasy.

**Why FakeXrmEasy:** purpose-built for Dataverse plug-in testing. Provides `IOrganizationService` and `IPluginExecutionContext` mocks that behave like the real platform (entity collections, alternate keys, query expressions, optimistic concurrency). Lets us cover ~95% of the logic without a tenant round-trip per test. Real-tenant concurrency test is the irreducible 5% that mocks cannot verify.

**Why both layers:** unit tests run in seconds, catch logic regressions, give fast feedback. The concurrency test runs minutes, catches race conditions that unit tests structurally cannot. Both are required; neither replaces the other.

## Custom Action Signature

Per PRD section 9.3 ("takes the six segment codes and the requested count, and returns the array of issued sequence numbers"), defined in `customactions/enmax_acdnIssueNumbers/`:

| Parameter | Direction | Type | Required | Description |
|-----------|-----------|------|----------|-------------|
| `Business` | Input | String (max 2) | Yes | Business code (`BB`) |
| `Asset` | Input | String (max 2) | Yes | Asset code (`AA`) |
| `Unit` | Input | String (max 2) | Yes | Unit code (`UU`); 1–2 alphanumeric chars accepted, plug-in zero-pads to 2 only on key composition (column value preserved as supplied) |
| `Domain` | Input | String (max 3) | Yes | Domain code (`DDD`) |
| `System` | Input | String (max 3) | Yes | System code (`SSS`) |
| `Kind` | Input | String (max 2) | Yes | Kind code (`KK`) |
| `Count` | Input | Integer | Yes | Number of consecutive sequence values to issue (1..`MaxDrawingsPerReservation` per App Config; plug-in enforces 1..1000 hard ceiling regardless of config) |
| `IssuedNumbers` | Output | String (JSON) | — | JSON array of integers, e.g. `[501, 502, 503]` |
| `SequenceKey` | Output | String | — | The composed sequence key (`BB-AA-UU-DDD-SSS-KK`, uppercase) — for client-side display and audit |
| `NewLastIssued` | Output | Integer | — | Post-issuance `LastIssued` value (used by the caller to update audit trail) |
| `Status` | Output | OptionSet (`enmax_acdn_numbersequencestatus`) | — | Post-issuance sequence status (Healthy / Warning / Critical / Exhausted) |

**Bound to entity:** No (unbound / "Global" custom action — invoked by name, not on a specific row).

**Plug-in step registration:**
- Message: `enmax_acdnIssueNumbers` (the custom action message name)
- Stage: PostOperation
- Mode: Synchronous
- Execution order: 1
- Filtering attributes: none (unbound action)
- Run in user context: Calling user (so audit attribution is correct)

## Step 1 — Custom Action Metadata (in maker)

Author the custom action in `https://make.powerapps.com/` solution `enmaxautocadsln`:

1. Navigate to **Solutions → Enmax AutoCAD Document Numbering System → New → Automation → Custom API** (Custom API is the modern Dataverse mechanism; under the hood it composes the same plug-in step as legacy custom actions).
2. Set:
   - Unique name: `enmax_acdnIssueNumbers`
   - Display name: `Issue ENMAX Numbers`
   - Binding type: Global (unbound)
   - Is function: No (this is an action; it has side effects)
   - Enabled for workflow: Yes (so Power Automate can call it)
   - Allowed custom processing step: SyncAndAsync
   - Is private: No (callable from Code App and flows)
3. Add the input parameters and output parameters per the table above. Use the maker UI's Custom API Parameters table; do **not** hand-edit XML for parameters.
4. Export the solution unmanaged, unpack to `solution/src/`, commit.

The resulting unpacked XML lives under `solution/src/CustomAPIs/enmax_acdnIssueNumbers/` and `solution/src/CustomAPIRequestParameters/` + `solution/src/CustomAPIResponseProperties/`.

## Step 2 — Test Project Scaffold

**Create test project alongside the plug-in:**

```powershell
Set-Location solution/plugins
dotnet new xunit -n IssueNumbers.Tests -f net462

Set-Location IssueNumbers.Tests
dotnet add reference ../IssueNumbers/IssueNumbers.csproj
dotnet add package FakeXrmEasy.v9 --version 3.5.1
dotnet add package Microsoft.NETFramework.ReferenceAssemblies --version 1.0.3
dotnet add package FluentAssertions --version 6.12.0
```

**Expected `IssueNumbers.Tests.csproj`:**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net462</TargetFramework>
    <IsPackable>false</IsPackable>
    <RootNamespace>Enmax.AutoCad.Plugins.IssueNumbers.Tests</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.10.0" />
    <PackageReference Include="xunit" Version="2.9.0" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
    <PackageReference Include="FakeXrmEasy.v9" Version="3.5.1" />
    <PackageReference Include="FluentAssertions" Version="6.12.0" />
    <PackageReference Include="Microsoft.NETFramework.ReferenceAssemblies" Version="1.0.3">
      <PrivateAssets>all</PrivateAssets>
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
    </PackageReference>
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\IssueNumbers\IssueNumbers.csproj" />
  </ItemGroup>
</Project>
```

**FakeXrmEasy v9 license:** Free OSS tier confirmed acceptable (decision 2026-05-17). Repository qualifies for the free tier per the FakeXrmEasy dual-licence model. Add a `solution/plugins/IssueNumbers.Tests/LICENSE-NOTICE.md` documenting the OSS-tier reliance and a link to the FakeXrmEasy licence terms so future maintainers see the choice was deliberate.

## Step 3 — TDD Red: Write Failing Tests First

Per CLAUDE.md Rule 9 (tests verify intent, not just behaviour) and Rule 14, every test below must encode *why* the behaviour matters, and the IssueNumbers concurrency test must exist before any production code.

**File:** `solution/plugins/IssueNumbers.Tests/IssueNumbersPluginTests.cs`

**Test cases (xUnit `[Fact]` or `[Theory]`; FluentAssertions for readable asserts):**

| # | Test name | Asserts | Why it matters |
|---|-----------|---------|----------------|
| 1 | `Issue_HappyPath_FreshCombination_Returns0001` | Given no Number Sequence row exists for combo, when Count=1, then returns `[1]` and creates row with LastIssued=1 | First-use semantics; PRD 9.4 default seed |
| 2 | `Issue_HappyPath_ExistingSequence_StartsFromLastIssuedPlusOne` | Given LastIssued=42, when Count=3, then returns `[43,44,45]` and writes LastIssued=45 | Monotonic + contiguous |
| 3 | `Issue_HappyPath_SeedValue_Applied` | Given fresh combo with SeedValue=500, when Count=1, then returns `[501]` | Legacy migration cutover |
| 4 | `Issue_SequenceKey_ComposedUppercase` | Given inputs `gg`, `cg`, `00`, `ecs`, `ast`, `dd`, when called, then SequenceKey output is `GG-CG-00-ECS-AST-DD` | Sequence Key is unique key; case folding required to dedupe by alternate key |
| 5 | `Issue_SequenceKey_WhitespaceTrimmed` | Given inputs with leading/trailing whitespace, when called, then key is trimmed | Defensive: client copy-paste artefacts |
| 6 | `Issue_Ceiling_AtLimit_LastIssued9998_Count1_Returns9999` | LastIssued=9998 + Count=1 → returns `[9999]`, status=Exhausted | Edge: exact ceiling |
| 7 | `Issue_Ceiling_Exceeded_Throws` | LastIssued=9990 + Count=20 → throws `InvalidPluginExecutionException` with message containing "would exceed 9999"; no write performed | PRD 9.5 hard ceiling; "system does not permit auto-extending the format" |
| 8 | `Issue_Ceiling_AlreadyExhausted_Throws` | LastIssued=9999 + Count=1 → throws | Idempotent rejection at ceiling |
| 9 | `Issue_Count_Zero_Throws` | Count=0 → throws `InvalidPluginExecutionException("Count must be between 1 and 1000")` | Input validation; prevents no-op writes |
| 10 | `Issue_Count_Negative_Throws` | Count=-5 → throws | Defensive |
| 11 | `Issue_Count_Above1000_Throws` | Count=1001 → throws | Hard ceiling regardless of MaxDrawingsPerReservation config |
| 12 | `Issue_Status_BelowWarning_Healthy` | LastIssued=8999 post-write → Status=Healthy (code 1) | PRD 9 column definition |
| 13 | `Issue_Status_AtWarning_9000_Warning` | LastIssued=9000 post-write → Status=Warning (code 2) | Threshold |
| 14 | `Issue_Status_AtCritical_9900_Critical` | LastIssued=9900 post-write → Status=Critical (code 3) | Threshold |
| 15 | `Issue_Status_AtExhausted_9999_Exhausted` | LastIssued=9999 post-write → Status=Exhausted (code 4) | Threshold |
| 16 | `Issue_LastIssuedAt_Updated` | Post-issuance row has `LastIssuedAt` within 5s of `DateTime.UtcNow` | Diagnostic column populated |
| 17 | `Issue_ConcurrencyVersionMismatch_RetriesOnce_Succeeds` | First update throws `ConcurrencyVersionMismatch`, second succeeds → returned numbers correct; assert exactly 2 update attempts | Optimistic retry semantics |
| 18 | `Issue_ConcurrencyVersionMismatch_RetriesUpTo3Times_ThenThrows` | All 3 update attempts throw `ConcurrencyVersionMismatch` → plug-in throws `InvalidPluginExecutionException("Could not issue numbers after 3 retries; please try again.")`; assert 3 attempts | Bounded retry; user gets actionable error |
| 19 | `Issue_ConcurrencyVersionMismatch_BackoffApplied` | Time between retry attempts ≥ 100ms, 200ms (exponential); assert via mock clock | Bounded exponential backoff prevents thundering herd |
| 20 | `Issue_MissingRequiredParameter_Business_Throws` | Business param missing → throws `InvalidPluginExecutionException` listing missing param | Contract validation |
| 21 | `Issue_RowAutoCreate_RaceLost_RetriesRetrieve` | Two simultaneous first-callers for the same fresh combo; one Create succeeds, one fails with duplicate-key error → loser retries Retrieve and proceeds with the row the winner just created | Auto-create race handled |
| 22 | `Issue_AuditAttribution_UsesCallingUser` | Plug-in execution context's `UserId` is the user whose context was passed in (not service account) | Audit log correctness |

**Sample test (test #2):**

```csharp
[Fact]
public void Issue_HappyPath_ExistingSequence_StartsFromLastIssuedPlusOne()
{
    // Arrange
    var ctx = MiddlewareBuilder
        .New()
        .AddCrud()
        .AddFakeMessageExecutors()
        .Build()
        .GetOrganizationService();

    var existing = new Entity("enmax_autocadnumbersequence")
    {
        Id = Guid.NewGuid(),
        ["enmax_acdnsequencekey"] = "GG-CG-00-ECS-AST-DD",
        ["enmax_acdnseedvalue"] = 0,
        ["enmax_acdnlastissued"] = 42,
    };
    ctx.Create(existing);

    var pluginCtx = new XrmFakedPluginExecutionContext
    {
        MessageName = "enmax_acdnIssueNumbers",
        InputParameters = new ParameterCollection
        {
            { "Business", "GG" }, { "Asset", "CG" }, { "Unit", "00" },
            { "Domain", "ECS" }, { "System", "AST" }, { "Kind", "DD" },
            { "Count", 3 },
        },
        OutputParameters = new ParameterCollection(),
    };

    var plugin = new IssueNumbersPlugin();

    // Act
    ExecutePlugin(plugin, pluginCtx, ctx);

    // Assert
    var issued = JsonConvert.DeserializeObject<int[]>(
        (string)pluginCtx.OutputParameters["IssuedNumbers"]);
    issued.Should().Equal(new[] { 43, 44, 45 });

    var updated = ctx.Retrieve("enmax_autocadnumbersequence", existing.Id, new ColumnSet(true));
    updated.GetAttributeValue<int>("enmax_acdnlastissued").Should().Be(45);
}
```

**Run tests, confirm all 22 fail with NotImplementedException** (the plan #01 stub throws this from `Plugin1.cs` / renamed `IssueNumbersPlugin.cs`).

## Step 4 — TDD Green: Implement the Plug-in

**File:** `solution/plugins/IssueNumbers/IssueNumbersPlugin.cs`

Rename `Plugin1.cs` → `IssueNumbersPlugin.cs`. Implement `ExecuteDataversePlugin` per the contract derived from the tests.

**Core algorithm (pseudocode):**

```
ExecuteDataversePlugin(context):
  1. Parse inputs: Business, Asset, Unit, Domain, System, Kind, Count
     - Validate every required param present (test #20)
     - Validate Count ∈ [1, 1000] (tests #9, #10, #11)
  2. Compose sequenceKey = $"{Business}-{Asset}-{Unit}-{Domain}-{System}-{Kind}".ToUpperInvariant().Trim() (tests #4, #5)
  3. Attempt to retrieve Number Sequence row by alternate key sequenceKey:
     - If not found, create new row with LastIssued = 0, SeedValue = 0, Status = Healthy
       - Catch DuplicateKeyException → another caller created it; retrieve and proceed (test #21)
  4. Compute proposedLastIssued = max(currentLastIssued, seedValue) + Count
  5. If proposedLastIssued > 9999 → throw InvalidPluginExecutionException("…would exceed 9999…") (tests #7, #8)
  6. Compute issued = [currentLastIssued + 1 .. proposedLastIssued]
  7. Update row with:
       LastIssued = proposedLastIssued
       LastIssuedAt = DateTime.UtcNow
       Status = ComputeStatus(proposedLastIssued)   // 9000→Warning, 9900→Critical, 9999→Exhausted (tests #12-15)
     - On ConcurrencyVersionMismatch: retry up to 3 times with exponential backoff (100ms, 200ms, 400ms) (tests #17, #18, #19)
     - After 3 failures: throw InvalidPluginExecutionException
  8. Write output parameters: IssuedNumbers (JSON), SequenceKey, NewLastIssued, Status
```

**Implementation details:**

- Use `IOrganizationService.RetrieveMultiple` with `FilterExpression` on `enmax_acdnsequencekey` rather than `Retrieve` by alternate key — the alternate-key API requires `KeyAttributeCollection` which has slightly more boilerplate but is faster (one round-trip vs query). Use whichever is documented as supported for plug-in context against alternate keys in current MS Learn.
- Use `Newtonsoft.Json` (already a transitive dep of `Microsoft.CrmSdk.CoreAssemblies`) for the IssuedNumbers JSON serialisation; do not introduce System.Text.Json (not available on net462 without an additional package).
- Retry logic in a private helper `RetryWithBackoff(Action action, int maxAttempts, ITracingService tracing)` for testability (injectable clock via constructor for test #19).
- Status thresholds as private const ints; no magic numbers.
- Plug-in is *stateless* per MS Learn guidance — no instance fields beyond the constructor-injected sequenceKey type registration. All state lives in method-local variables and the context.

## Step 5 — Plug-in Registration

**Build + sign:**

```powershell
Set-Location solution/plugins/IssueNumbers
dotnet build --configuration Release
# Output: bin/Release/net462/IssueNumbers.dll (strong-named via .snk from plan #01)
```

**Register via Plug-in Registration Tool (PRT):**

```powershell
pac tool prt   # Launches the GUI tool
```

In PRT:
1. Connect to dev tenant
2. Register New Assembly → select `IssueNumbers.dll` → Sandbox isolation, Database storage
3. The tool discovers `IssueNumbersPlugin` class automatically
4. Register New Step:
   - Message: `enmax_acdnIssueNumbers`
   - Entity: none (unbound)
   - Stage: PostOperation
   - Mode: Synchronous
   - Execution Order: 1

**Source-of-truth for registration:** the registration metadata is captured in the solution as part of the Custom API definition. After registering in PRT, **export the solution again, unpack, and commit** so the registration is reproducible across environments. PRT registration without solution export is a one-shot operation; a fresh tenant won't have it.

**Alternative (preferred long-term):** registration can be expressed in `customapi.json` and applied via `pac plugin push`. Document this in the runbook but use PRT for the bootstrap to verify the configuration interactively.

## Step 6 — Integration / Concurrency Test (Real Dataverse)

**File:** `solution/plugins/IssueNumbers.Tests/IssueNumbersConcurrencyTests.cs`

This is the PRD-mandated test (section 23): N ≥ 50 parallel callers against the real custom action, asserts unique + contiguous + monotonically increasing returns.

**Test structure:**

```csharp
public class IssueNumbersConcurrencyTests : IClassFixture<DataverseFixture>
{
    private readonly DataverseFixture _fx;
    public IssueNumbersConcurrencyTests(DataverseFixture fx) => _fx = fx;

    [Fact]
    [Trait("Category", "Integration")]
    public async Task Issue_50Parallel_NoDuplicatesNoGaps()
    {
        // Arrange: pick a dedicated test combo and reset its sequence
        const string testKey = "ZZ-ZZ-ZZ-ZZZ-ZZZ-ZZ";   // reserved per plan #02
        await _fx.ResetSequenceAsync(testKey);

        const int N = 50;
        var tasks = Enumerable.Range(0, N).Select(_ =>
            _fx.InvokeIssueNumbersAsync(
                business: "ZZ", asset: "ZZ", unit: "ZZ",
                domain: "ZZZ", system: "ZZZ", kind: "ZZ",
                count: 1));

        // Act
        var results = await Task.WhenAll(tasks);

        // Assert
        var issued = results.SelectMany(r => r.IssuedNumbers).OrderBy(n => n).ToArray();
        issued.Should().HaveCount(N);
        issued.Should().OnlyHaveUniqueItems("no duplicates allowed under concurrent load");
        issued.Should().BeInAscendingOrder();
        issued.First().Should().Be(1, "fresh sequence starts at 1");
        issued.Last().Should().Be(N, "no gaps; N consecutive numbers");
    }

    [Fact]
    [Trait("Category", "Integration")]
    public async Task Issue_50Parallel_VariableCount_StillUnique()
    {
        // Same as above but Count ∈ [1..5]; total issued numbers should be exactly Σ counts;
        // no overlaps between any two callers' ranges.
        // ...
    }
}
```

**DataverseFixture responsibilities:**
- Authenticate to dev tenant via service principal (env vars set by `cd-dev.yml`)
- Provide `InvokeIssueNumbersAsync` that calls the custom action via Dataverse Web API
- Provide `ResetSequenceAsync(key)` that deletes the test sequence row (used in `[Fact]` setup; idempotent if row doesn't exist)
- Lifecycle: `IDisposable`; no cleanup of test sequence rows beyond per-test reset (the `ZZ` combination is reserved for concurrency testing only)

**Why not FakeXrmEasy for this test:** FakeXrmEasy mocks process all operations on a single thread. The race condition we're testing for is a real-platform behaviour involving optimistic concurrency across the Dataverse SQL backend. A mock cannot simulate it faithfully.

**Test data isolation:**
- Sequence key `ZZ-ZZ-ZZ-ZZZ-ZZZ-ZZ` reserved exclusively for concurrency testing (documented in plan #02 risks).
- Test fixture resets this row's `LastIssued` to 0 before each test; tests are sequential within the class (xUnit `IClassFixture` shares instance, methods do not parallelise within a single test class by default).
- Other test data: none. The combo is meaningless to production semantics.

**Run cadence:**
- Locally: `dotnet test --filter Category=Integration` (after setting env vars)
- CI: nightly via `cd-dev.yml` scheduled trigger + on every PR that touches `solution/plugins/IssueNumbers/**` (path filter)

## Step 7 — CI Integration

Update `.github/workflows/ci.yml` to run unit tests on every PR:

```yaml
      - name: Run plug-in unit tests
        working-directory: solution/plugins/IssueNumbers.Tests
        run: dotnet test --configuration Release --filter "Category!=Integration" --logger "trx;LogFileName=test-results.trx"
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: plugin-unit-test-results
          path: solution/plugins/IssueNumbers.Tests/TestResults/
```

Update `.github/workflows/cd-dev.yml` to run the concurrency test after deploy:

```yaml
      - name: Run plug-in concurrency tests (real Dataverse)
        working-directory: solution/plugins/IssueNumbers.Tests
        env:
          DATAVERSE_URL: ${{ secrets.DEV_DATAVERSE_URL }}
          DATAVERSE_CLIENT_ID: ${{ secrets.DEV_SP_CLIENT_ID }}
          DATAVERSE_CLIENT_SECRET: ${{ secrets.DEV_SP_CLIENT_SECRET }}
          DATAVERSE_TENANT_ID: ${{ secrets.DEV_TENANT_ID }}
        run: dotnet test --configuration Release --filter "Category=Integration" --logger "trx"
```

**PR gate:** CI must be green AND reviewed by Rahul before merge. Add a CODEOWNERS entry:

```
# .github/CODEOWNERS
/solution/plugins/IssueNumbers/         @rahulnakmol
/solution/plugins/IssueNumbers.Tests/   @rahulnakmol
```

Single-reviewer model accepted per project decision 2026-05-17.

## Verification — End-to-End Checklist

```powershell
# Unit tests (no Dataverse needed)
Set-Location solution/plugins/IssueNumbers.Tests
dotnet test --filter "Category!=Integration"
# Expected: all 22 tests pass

# Build for deploy
Set-Location ../IssueNumbers
dotnet build --configuration Release

# Register manually first time (PRT GUI)
pac tool prt

# Export updated solution + commit
Set-Location ../../..
pac solution export `
  --path solution/build/enmaxautocadsln_unmanaged.zip `
  --name enmaxautocadsln `
  --managed false
pac solution unpack `
  --zipfile solution/build/enmaxautocadsln_unmanaged.zip `
  --folder solution/src `
  --packagetype Unmanaged `
  --allowDelete true
git diff solution/src/CustomAPIs/     # confirm custom API + step + assembly captured

# Concurrency test against dev tenant (requires service principal env vars)
$env:DATAVERSE_URL = "https://<dev-org>.crm3.dynamics.com"
$env:DATAVERSE_CLIENT_ID = "<sp-client-id>"
$env:DATAVERSE_CLIENT_SECRET = "<from-key-vault>"
$env:DATAVERSE_TENANT_ID = "<tenant-id>"
Set-Location solution/plugins/IssueNumbers.Tests
dotnet test --filter "Category=Integration"
# Expected: 2 integration tests pass; takes ~30-60 seconds

# Repeat 10x to confirm no flakiness
1..10 | ForEach-Object { dotnet test --filter "Category=Integration" --no-build }
# Expected: 10/10 pass with zero duplicates and zero gaps
```

**Acceptance:**
- All 22 unit tests pass in `ci.yml`
- Concurrency test passes 10 consecutive runs in `cd-dev.yml` against real dev tenant
- PR reviewed by Rahul (single-reviewer model per project decision 2026-05-17)
- Squash-merged into `dev`
- No regressions in plan #02's schema (custom API addition is purely additive)

## Critical Files to Read Before Starting

| File | Why |
|------|-----|
| `.worktrees/specs/docs/superpowers/specs/PRD-and-Architecture.md` sections 9, 22, 23 | Authoritative concurrency, seed, and test-strategy semantics |
| `CLAUDE.md` Rule 14 | Non-negotiability of concurrency test; second-reviewer requirement |
| `.worktrees/specs/docs/superpowers/plans/2026-05-17-plan-02-dataverse-schema-and-seed.md` Step 4 + Step 5 | Number Sequence table schema, alternate key |
| [MS Learn: Write a plug-in](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/write-plug-in) | PluginBase pattern, IPlugin contract, stateless guidance |
| [MS Learn: Custom APIs](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/custom-api) | Custom API metadata, registration semantics |
| [FakeXrmEasy v9 docs](https://dynamicsvalue.github.io/fake-xrm-easy-docs/) | Mock setup, MiddlewareBuilder, IClassFixture patterns |

## Downstream Plans Unblocked by This Plan

| Plan | Unblocked? | Why |
|------|------------|-----|
| #04 Code App shell + `useIssueNumbers` hook | Yes | Custom action exists; React Query mutation wraps Web API call to `/api/data/v9.2/enmax_acdnIssueNumbers` |
| #05 Reservation flow | Yes | Power Automate "On Reservation Approved → Issue Drawings" calls this action to get the numbers before creating Drawing rows |
| #06 Check-Out / Check-In | No direct dep | Operates on existing Drawings; doesn't issue new numbers |
| #07 Search + admin surfaces | No direct dep | |
| #08 Broadcast + notifications | Partial | Number Sequence status broadcast at 9900 threshold needs a scheduled flow that watches the Status column this plug-in maintains |
| #09 UAT promotion | No | Blocked on full feature set; this plan only confirms the plug-in is deployable across environments |

## Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| Plug-in dll fails to load in Dataverse sandbox due to dependency mismatch | Hard-pin Microsoft.CrmSdk.CoreAssemblies version (9.0.2.51); CI builds against the exact same NuGet manifest used at registration; concurrency test exercises the deployed assembly, not the local build |
| `ConcurrencyVersionMismatch` retry loop runs indefinitely under sustained load | Hard cap at 3 attempts (test #18); thereafter throws to client with actionable message. Client retries are bounded by its own back-off (defined in plan #04 useIssueNumbers hook) |
| Auto-create race between two first-callers leaves two rows with the same Sequence Key | Alternate key on `enmax_acdnsequencekey` (plan #02 Step 5) enforces uniqueness at the platform; Dataverse rejects the second Create with DuplicateKeyException; plug-in catches and retries Retrieve (test #21) |
| FakeXrmEasy v3+ commercial licence blocks adoption | Resolved 2026-05-17: project qualifies for free OSS tier; `LICENSE-NOTICE.md` records the choice |
| Concurrency test pollutes dev tenant with thousands of ZZ-prefix rows | Test resets the sequence per run; the `ZZ` combination is reserved (no real reservations use it); Drawing rows are NOT created by the custom action — only the Number Sequence counter advances, so no Drawing-row cleanup needed |
| Plug-in execution exceeds Dataverse synchronous step time limit (2 minutes) | Per PRD: typical Count is 1–10; happy-path execution is <100ms; retry path is <2s; well within limits. Concurrency test confirms behaviour under load |
| PRT-registered step diverges from solution-XML registration | After every PRT change, immediately export + unpack + commit; CI runs `pac solution check` against the solution to verify consistency (added in plan #02 Step verification TODO) |
| Strong-name signing key compromise | `.snk` is committed to repo (it's a build artefact, not a secret per MS Learn). Rotation requires re-registering all plug-in steps; documented in runbook #007 |
| net462 target framework deprecated by Microsoft mid-Phase-1 | Dataverse runtime version is the constraint, not our choice; Microsoft commits to net462 plug-in support through at least 2027 per current MS Learn. Re-target is a multi-week effort if forced; document as Phase 2 watch-item |

## TODOs Left in This Plan

- **`customapi.json` source-of-truth migration:** Step 5 documents PRT bootstrap as preferred for first registration; long-term, registration metadata should be 100% authored in `solution/src/` and applied via `pac plugin push`. Migration is a follow-up plan, not blocking.
- **Mock clock injection mechanism for test #19:** xUnit + FluentAssertions don't natively provide a deterministic clock; use a `Func<DateTime> _now` constructor parameter on the plug-in with default `() => DateTime.UtcNow` and override in tests. Implementation detail finalised during Step 4 coding.
