# Plan #12 — Drawing Lifecycle & Finalization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-05-24
**Owner:** Engineering (Claude Code agent + reviewer: Rahul Akmol)
**Spec:** `2026-05-23-drawing-lifecycle-finalization-design.md`
**Branch:** `feat/008-drawing-lifecycle` → PR to `dev`
**Base branch:** `feat/006-checkout-checkin-revision` (has the checkout plugins + Code App checkout feature this plan modifies; if #06 has merged to `dev` by execution time, branch from `dev` instead)

**Goal:** Give drawings a full, audit-complete lifecycle — auto-created → Available → (checkout/checkin revision cycles) → Finalized, plus admin Obsolete/Void — with every state transition propagated to sheets in the same transaction and every audit event keyed to the drawing.

**Architecture:** All state changes run through concurrency-safe Dataverse plugins (Custom APIs) using `ConcurrencyBehavior.IfRowVersionMatches` on the drawing row; the drawing update serializes the race, so sheet bulk-updates and audit rows that follow need no RowVersion. The Code App calls these Custom APIs through generated services / `executeAsync`, never mutating state directly. Audit events always set `subjectid = drawingId` so `useDrawingAuditTrail(drawingId)` shows the full timeline.

**Tech Stack:** C# Dataverse plugins (.NET Framework 4.6.2, FakeXrmEasy + xUnit + FluentAssertions for unit tests, live Dataverse for integration tests), Python (`patch_optionsets.py`), React 18 + TypeScript + Fluent UI v9 + TanStack Query + Vitest/RTL/MSW (Code App).

---

## Worktree Setup (before Task 1)

Use the `superpowers:using-git-worktrees` skill. Target an isolated worktree on branch `feat/008-drawing-lifecycle` based on `feat/006-checkout-checkin-revision`. Run baseline build + tests before starting:

```bash
# plugins
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "Category!=Integration" --configuration Release
# code app
cd apps/code-app && npm ci && npm test -- --run
```

Both must be green before Task 1. If red, surface to the user (CLAUDE.md Rule 12) — do not proceed.

---

## Critical Conventions (read before coding)

**Sheet state is OFFSET from drawing state** — sheets have an extra early state ("Pending Initial Upload" = 1) with no drawing equivalent. The mapping that every sheet-propagating plugin must use:

| Drawing state | value | → Sheet state | value |
|---|---|---|---|
| Available | 1 | Available | **2** |
| Checked Out | 2 | Checked Out | **3** |
| Awaiting Validation | 3 | Awaiting Validation | **4** |
| Obsolete | 5 | Obsolete | 5 |
| Void | 6 | Void | 6 |
| Finalized | 7 | Finalized | 7 |

**Audit subjectid is ALWAYS the drawing** — `enmax_acdnsubjectid = drawingId.ToString()`, `enmax_acdnsubjecttable = "enmax_autocaddrawing"`. Never the checkout id. Several existing plugins get this wrong; this plan fixes them.

**Concurrency contract** (spec §4.1) for every state-changing plugin:
1. `Retrieve` the drawing with its state column (RowVersion comes back automatically).
2. Validate the guard; throw `InvalidPluginExecutionException` if it fails.
3. `UpdateRequest` with `entity.RowVersion` + `ConcurrencyBehavior.IfRowVersionMatches`.
4. Catch `ConcurrencyVersionMismatch` → throw `InvalidPluginExecutionException("...concurrently modified...retry")`.
5. Only after the drawing update succeeds: bulk-update sheets, write audit.

**Plugin location** — all `.cs` files go in the existing `solution/plugins/IssueNumbers/` project (namespace `Enmax.AutoCAD`). Tests go in `solution/plugins/IssueNumbers.Tests/` (namespace `Enmax.AutoCad.Plugins.IssueNumbers.Tests`). Never create a new `.csproj`.

---

## Task 1: Schema — option set values + patch script

**Files:**
- Modify: `solution/src/OptionSets/enmax_acdn_drawingstate.xml`
- Modify: `solution/src/OptionSets/enmax_acdn_sheetstate.xml`
- Modify: `solution/src/OptionSets/enmax_acdn_auditevent.xml`
- Modify: `solution/scripts/patch_optionsets.py`

No tests (declarative XML + idempotent patch script). Verification is the `--dry-run`.

- [ ] **Step 1: Add Finalized(7) to drawing state XML**

In `enmax_acdn_drawingstate.xml`, insert before the closing `</options>` (after the Void value-6 block):

```xml
    <option value="7" ExternalValue="" IsHidden="0">
      <labels>
        <label description="Finalized" languagecode="1033" />
      </labels>
    </option>
```

- [ ] **Step 2: Add Finalized(7) to sheet state XML**

In `enmax_acdn_sheetstate.xml`, insert before the closing `</options>` (after the Void value-6 block):

```xml
    <option value="7" ExternalValue="" IsHidden="0">
      <labels>
        <label description="Finalized" languagecode="1033" />
      </labels>
    </option>
```

- [ ] **Step 3: Add Finalized(9) to audit event XML**

In `enmax_acdn_auditevent.xml`, insert before the closing `</options>` (after the Reference Data Changed value-8 block):

```xml
    <option value="9" ExternalValue="" IsHidden="0">
      <labels>
        <label description="Finalized" languagecode="1033" />
      </labels>
    </option>
```

- [ ] **Step 4: Patch script — add sheetstate (missing entirely) + Finalized values**

In `patch_optionsets.py`, the `OPTIONSET_PATCHES` dict is missing `enmax_acdn_sheetstate` completely. Add it, and append the new Finalized values to `drawingstate` and `auditevent`.

In the `enmax_acdn_drawingstate` list, append after `(6, "Void")`:
```python
        (7, "Finalized"),
```

Add a brand-new entry to the dict (place it right after the `enmax_acdn_drawingstate` block):
```python
    "enmax_acdn_sheetstate": [
        (0, "None"),
        (1, "Pending Initial Upload"),
        (2, "Available"),
        (3, "Checked Out"),
        (4, "Awaiting Validation"),
        (5, "Obsolete"),
        (6, "Void"),
        (7, "Finalized"),
    ],
```

In the `enmax_acdn_auditevent` list, append after `(8, "Reference Data Changed")`:
```python
        (9, "Finalized"),
```

- [ ] **Step 5: Verify with dry-run**

Run from repo root (env loaded from `.env.local` at the MAIN repo root — see memory `reference_deployment_runbook`):

```bash
python solution/scripts/patch_optionsets.py --dry-run
```

Expected: lines like `[dry-run] would patch enmax_acdn_sheetstate[7] -> 'Finalized'` and `enmax_acdn_drawingstate[7] -> 'Finalized'` and `enmax_acdn_auditevent[9] -> 'Finalized'`, exit 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add solution/src/OptionSets/enmax_acdn_drawingstate.xml solution/src/OptionSets/enmax_acdn_sheetstate.xml solution/src/OptionSets/enmax_acdn_auditevent.xml solution/scripts/patch_optionsets.py
git commit -m "feat(plan-12): add Finalized option-set values; register sheetstate in patch script"
```

---

## Task 2: AutoCreateDrawingsPlugin — initialise sheet state + emit Created audit

**Files:**
- Modify: `solution/plugins/IssueNumbers/AutoCreateDrawingsPlugin.cs`
- Test: `solution/plugins/IssueNumbers.Tests/AutoCreateDrawingsPluginTests.cs`

Per spec §4.4: write one `Created`(1) audit per drawing, subjectid=drawingId. Also initialise each created sheet to Available(2) so the mirror is consistent from birth.

- [ ] **Step 1: Write failing tests**

Open `AutoCreateDrawingsPluginTests.cs`. Add these two tests inside the test class (reuse the existing `BuildContext`/post-image setup already in that file — match its helper names). If the existing file already has a post-image builder that produces an Approved reservation with one issued number, call it; otherwise add the asserts to the existing happy-path test that creates drawings:

```csharp
[Fact]
public void Each_created_drawing_gets_a_Created_audit_event_keyed_to_the_drawing()
{
    var (ctx, pluginCtx) = BuildApprovedReservationContext(issuedNumbers: new[] { 1, 2 }, sheetsPerDrawing: 1);

    ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

    var svc    = ctx.GetFakedOrganizationService();
    var audits = svc.RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) });

    audits.Entities.Should().HaveCount(2,
        because: "one Created audit must be written per drawing");
    audits.Entities.Should().OnlyContain(a => a.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value == 1,
        because: "event type 1 = Created");
    audits.Entities.Should().OnlyContain(a => a.GetAttributeValue<string>("enmax_acdnsubjecttable") == "enmax_autocaddrawing",
        because: "audit subject table must be the drawing, never the reservation or checkout");

    var drawings = svc.RetrieveMultiple(new QueryExpression("enmax_autocaddrawing") { ColumnSet = new ColumnSet("enmax_autocaddrawingid") });
    var drawingIds = drawings.Entities.Select(d => d.Id.ToString()).ToHashSet();
    audits.Entities.Should().OnlyContain(a => drawingIds.Contains(a.GetAttributeValue<string>("enmax_acdnsubjectid")),
        because: "each audit subjectid must be a real drawing id");
}

[Fact]
public void Created_sheets_start_in_sheet_Available_state()
{
    var (ctx, pluginCtx) = BuildApprovedReservationContext(issuedNumbers: new[] { 1 }, sheetsPerDrawing: 2);

    ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

    var sheets = ctx.GetFakedOrganizationService()
        .RetrieveMultiple(new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") });

    sheets.Entities.Should().HaveCount(2);
    sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 2,
        because: "sheet Available = 2 mirrors the drawing's Available = 1");
}
```

> If the test file has no `BuildApprovedReservationContext` helper, add one modelled on the file's existing context setup: build an `enmax_autocadreservation` post-image with `enmax_acdnstatus=2`, `enmax_acdnissuednumbers=JsonConvert.SerializeObject(issuedNumbers)`, `enmax_acdnsheetsperdrawing=sheetsPerDrawing`, the six composition lookups each pointing at a reference row that has `enmax_acdncode` set, register it under alias `"postImage"`, set `MessageName="Update"`, `Stage=40`, a non-empty `InitiatingUserId`, and `PrimaryEntityId` = reservation id. Ensure `using System.Linq;` and `using Newtonsoft.Json;` are present.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~AutoCreateDrawingsPluginTests" --configuration Release
```

Expected: the two new tests FAIL (no audit rows written; sheet state null).

- [ ] **Step 3: Implement — sheet state + Created audit**

In `AutoCreateDrawingsPlugin.cs`, add constants near the existing ones:

```csharp
        private const string AuditEntity      = "enmax_autocadauditevent";
        private const int    AuditEventCreated = 1;
        private const int    AuditSourceAction = 4;
        private const int    SheetStateAvailable = 2;
```

In the sheet-creation loop, set the sheet state. Replace the sheet entity initialiser:

```csharp
                    var sheet = new Entity(SheetEntity)
                    {
                        ["enmax_acdndrawing"]     = new EntityReference(DrawingEntity, drawingId),
                        ["enmax_acdnsheetnumber"] = i,
                        ["enmax_acdnstate"]       = new OptionSetValue(SheetStateAvailable),
                    };
```

Immediately after the `for` loop that creates sheets (still inside `foreach (int number in numbers)`), write the Created audit:

```csharp
                service.Create(new Entity(AuditEntity)
                {
                    ["enmax_acdnevent"]        = new OptionSetValue(AuditEventCreated),
                    ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                    ["enmax_acdnsubjectid"]    = drawingId.ToString(),
                    ["enmax_acdnsubjecttable"] = DrawingEntity,
                    ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                    ["enmax_acdnname"]         = $"Drawing {drawingId} created",
                });
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~AutoCreateDrawingsPluginTests" --configuration Release
```

Expected: all AutoCreateDrawingsPluginTests PASS.

- [ ] **Step 5: Commit**

```bash
git add solution/plugins/IssueNumbers/AutoCreateDrawingsPlugin.cs solution/plugins/IssueNumbers.Tests/AutoCreateDrawingsPluginTests.cs
git commit -m "feat(plan-12): AutoCreateDrawings writes Created audit per drawing + initialises sheet state"
```

---

## Task 3: CheckOutDrawingPlugin — propagate sheet state

**Files:**
- Modify: `solution/plugins/IssueNumbers/CheckOutDrawingPlugin.cs`
- Test: `solution/plugins/IssueNumbers.Tests/CheckOutDrawingPluginTests.cs`

Per spec §4.4: after drawing → CheckedOut(2), bulk-update its sheets → Checked Out(3). Audit already keys to drawingId — no change there.

- [ ] **Step 1: Write failing test**

Add to `CheckOutDrawingPluginTests.cs`. The existing `BuildContext` only seeds a drawing; extend it to also seed sheets, or add a dedicated builder. Add this test plus a small helper that seeds two sheets linked to the drawing:

```csharp
[Fact]
public void CheckOut_transitions_related_sheets_to_CheckedOut()
{
    var ctx       = new XrmFakedContext();
    var drawingId = Guid.NewGuid();
    var userId    = Guid.NewGuid();

    var drawing = new Entity(DrawingEntity, drawingId) { [ColDrawingState] = new OptionSetValue(StateAvailable) };
    var sheet1  = new Entity("enmax_autocadsheet", Guid.NewGuid())
        { ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId), ["enmax_acdnstate"] = new OptionSetValue(2) };
    var sheet2  = new Entity("enmax_autocadsheet", Guid.NewGuid())
        { ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId), ["enmax_acdnstate"] = new OptionSetValue(2) };
    ctx.Initialize(new[] { drawing, sheet1, sheet2 });

    var pluginCtx = ctx.GetDefaultPluginContext();
    pluginCtx.MessageName      = "enmax_acdnCheckOutDrawing";
    pluginCtx.Stage            = 40;
    pluginCtx.InitiatingUserId = userId;
    pluginCtx.InputParameters  = new ParameterCollection();
    pluginCtx.OutputParameters = new ParameterCollection();
    pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);

    ctx.ExecutePluginWith<CheckOutDrawingPlugin>(pluginCtx);

    var sheets = ctx.GetFakedOrganizationService()
        .RetrieveMultiple(new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") });
    sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 3,
        because: "all sheets of a checked-out drawing must move to sheet CheckedOut = 3");
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~CheckOutDrawingPluginTests.CheckOut_transitions_related_sheets" --configuration Release
```

Expected: FAIL (sheets remain state 2).

- [ ] **Step 3: Implement — sheet bulk-update**

In `CheckOutDrawingPlugin.cs`, add a constant:
```csharp
        private const string SheetEntity        = "enmax_autocadsheet";
        private const string ColSheetDrawing    = "enmax_acdndrawing";
        private const string ColSheetState       = "enmax_acdnstate";
        private const int    SheetStateCheckedOut = 3;
```

Immediately after `localPluginContext.Trace($"Drawing {target.Id} transitioned to CheckedOut.");` (i.e. after the drawing update succeeds, before creating the checkout row), insert:

```csharp
            // Propagate state to sheets (drawing update above serialized concurrent access — no RowVersion needed)
            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, target.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(SheetStateCheckedOut) });
```

- [ ] **Step 4: Run full CheckOut tests — expect PASS**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~CheckOutDrawingPluginTests" --configuration Release
```

Expected: all PASS (existing checkout/audit tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add solution/plugins/IssueNumbers/CheckOutDrawingPlugin.cs solution/plugins/IssueNumbers.Tests/CheckOutDrawingPluginTests.cs
git commit -m "feat(plan-12): CheckOutDrawing propagates sheet state to CheckedOut"
```

---

## Task 4: SubmitRevisionPlugin — NEW plugin (replaces the client-side double PATCH)

**Files:**
- Create: `solution/plugins/IssueNumbers/SubmitRevisionPlugin.cs`
- Create: `solution/plugins/IssueNumbers.Tests/SubmitRevisionPluginTests.cs`

Per spec §4.3. Today the Code App does two non-atomic PATCHes (`checkoutClient.submitRevision`) and the no-approval "Check In" chains submit+approve from the client — both replaced by this single atomic, concurrency-safe Custom API `enmax_acdnSubmitRevision` (bound to `enmax_autocadcheckout`). The plugin reads AppConfig `RequireCheckInApproval` to branch.

- [ ] **Step 1: Write failing tests**

Create `SubmitRevisionPluginTests.cs`:

```csharp
using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Unit tests for SubmitRevisionPlugin.
    /// Custom API: enmax_acdnSubmitRevision (bound to enmax_autocadcheckout)
    /// </summary>
    public class SubmitRevisionPluginTests
    {
        private const string CheckoutEntity      = "enmax_autocadcheckout";
        private const string DrawingEntity       = "enmax_autocaddrawing";
        private const string SheetEntity         = "enmax_autocadsheet";
        private const string AppConfigEntity     = "enmax_autocadappconfig";
        private const string ColCheckoutStatus   = "enmax_acdnstatus";
        private const string ColCheckoutDrawing  = "enmax_acdndrawing";
        private const string ColNewRevision      = "enmax_acdnnewrevision";
        private const string ColDrawingState     = "enmax_acdnstate";
        private const string ColCurrentRevision  = "enmax_acdncurrentrevision";

        private const int StatusOpen               = 1;
        private const int StatusAwaitingValidation = 2;
        private const int StatusClosedApproved     = 3;
        private const int StateAvailable           = 1;
        private const int StateCheckedOut          = 2;
        private const int StateAwaitingValidation  = 3;

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid checkoutId, Guid drawingId)
            BuildContext(bool requireApproval, int checkoutStatus = StatusOpen, int drawingState = StateCheckedOut)
        {
            var ctx        = new XrmFakedContext();
            var drawingId  = Guid.NewGuid();
            var checkoutId = Guid.NewGuid();
            var userId     = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState]    = new OptionSetValue(drawingState),
                [ColCurrentRevision] = "A",
            };
            var checkout = new Entity(CheckoutEntity, checkoutId)
            {
                [ColCheckoutStatus]  = new OptionSetValue(checkoutStatus),
                [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
            };
            var sheet = new Entity(SheetEntity, Guid.NewGuid())
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(3),
            };
            var config = new Entity(AppConfigEntity, Guid.NewGuid())
            {
                ["enmax_acdnkey"]   = "RequireCheckInApproval",
                ["enmax_acdnvalue"] = requireApproval ? "true" : "false",
            };
            ctx.Initialize(new Entity[] { drawing, checkout, sheet, config });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnSubmitRevision";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = userId;
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"]      = new EntityReference(CheckoutEntity, checkoutId);
            pluginCtx.InputParameters["NewRevision"]  = "B";
            pluginCtx.InputParameters["Reason"]       = string.Empty;

            return (ctx, pluginCtx, checkoutId, drawingId);
        }

        [Fact]
        public void Approval_off_closes_checkout_and_returns_drawing_to_Available_with_bumped_revision()
        {
            var (ctx, pluginCtx, checkoutId, drawingId) = BuildContext(requireApproval: false);

            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            var svc      = ctx.GetFakedOrganizationService();
            var checkout = svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus));
            var drawing  = svc.Retrieve(DrawingEntity,  drawingId,  new ColumnSet(ColDrawingState, ColCurrentRevision));

            checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value.Should().Be(StatusClosedApproved,
                because: "with approval OFF, submitting a revision closes the checkout immediately");
            drawing.GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StateAvailable,
                because: "approval-off submit returns the drawing to Available");
            drawing.GetAttributeValue<string>(ColCurrentRevision).Should().Be("B",
                because: "the new revision must be stamped on the drawing");
        }

        [Fact]
        public void Approval_off_moves_sheets_to_Available()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(requireApproval: false);

            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            var sheets = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_acdnstate") });
            sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 2,
                because: "approval-off submit returns sheets to sheet Available = 2");
        }

        [Fact]
        public void Approval_on_sets_checkout_and_drawing_to_AwaitingValidation()
        {
            var (ctx, pluginCtx, checkoutId, drawingId) = BuildContext(requireApproval: true);

            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            var svc      = ctx.GetFakedOrganizationService();
            var checkout = svc.Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus, ColNewRevision));
            var drawing  = svc.Retrieve(DrawingEntity,  drawingId,  new ColumnSet(ColDrawingState));

            checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value.Should().Be(StatusAwaitingValidation,
                because: "with approval ON, the checkout waits for an approver");
            checkout.GetAttributeValue<string>(ColNewRevision).Should().Be("B",
                because: "the proposed revision is stored on the checkout until approved");
            drawing.GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StateAwaitingValidation,
                because: "approval-on submit moves the drawing to AwaitingValidation");
        }

        [Fact]
        public void Approval_on_moves_sheets_to_AwaitingValidation()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(requireApproval: true);

            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            var sheets = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_acdnstate") });
            sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 4,
                because: "approval-on submit moves sheets to sheet AwaitingValidation = 4");
        }

        [Fact]
        public void Audit_is_keyed_to_the_drawing_not_the_checkout()
        {
            var (ctx, pluginCtx, _, drawingId) = BuildContext(requireApproval: false);

            ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            var audits = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) });
            audits.Entities.Should().HaveCount(1, because: "exactly one State Changed audit per submit");
            var a = audits.Entities[0];
            a.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(2, because: "event 2 = State Changed");
            a.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString(),
                because: "audit must be keyed to the drawing so the drawing timeline shows it");
            a.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be(DrawingEntity);
        }

        [Fact]
        public void Missing_NewRevision_throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(requireApproval: false);
            pluginCtx.InputParameters["NewRevision"] = string.Empty;

            Action act = () => ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*NewRevision*",
                because: "a revision identifier is mandatory");
        }

        [Fact]
        public void Checkout_not_Open_throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(requireApproval: false, checkoutStatus: StatusClosedApproved);

            Action act = () => ctx.ExecutePluginWith<SubmitRevisionPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>().WithMessage($"*{StatusClosedApproved}*",
                because: "you can only submit a revision against an Open checkout");
        }
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL (does not compile / type missing)**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~SubmitRevisionPluginTests" --configuration Release
```

Expected: build error — `SubmitRevisionPlugin` does not exist.

- [ ] **Step 3: Implement the plugin**

Create `SubmitRevisionPlugin.cs`:

```csharp
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for submitting a revision against an open checkout.
    /// Custom API: enmax_acdnSubmitRevision (bound to enmax_autocadcheckout)
    ///
    /// Reads AppConfig RequireCheckInApproval:
    ///  - false: closes checkout (ClosedApproved), drawing -> Available + bumped revision, sheets -> Available.
    ///  - true : checkout -> AwaitingValidation, drawing -> AwaitingValidation, sheets -> AwaitingValidation.
    /// Drawing update uses RowVersion concurrency; sheets/audit follow the serialized drawing update.
    /// </summary>
    public class SubmitRevisionPlugin : PluginBase
    {
        private const string CheckoutEntity      = "enmax_autocadcheckout";
        private const string ColCheckoutStatus   = "enmax_acdnstatus";
        private const string ColCheckoutDrawing  = "enmax_acdndrawing";
        private const string ColNewRevision      = "enmax_acdnnewrevision";

        private const string DrawingEntity       = "enmax_autocaddrawing";
        private const string ColDrawingState     = "enmax_acdnstate";
        private const string ColCurrentRevision  = "enmax_acdncurrentrevision";

        private const string SheetEntity         = "enmax_autocadsheet";
        private const string ColSheetDrawing     = "enmax_acdndrawing";
        private const string ColSheetState       = "enmax_acdnstate";

        private const string AppConfigEntity     = "enmax_autocadappconfig";
        private const string ColAppConfigKey     = "enmax_acdnkey";
        private const string ColAppConfigValue   = "enmax_acdnvalue";

        private const string AuditEntity            = "enmax_autocadauditevent";
        private const int    AuditEventStateChanged = 2;
        private const int    AuditSourceAction      = 4;

        private const int StatusOpen               = 1;
        private const int StatusAwaitingValidation = 2;
        private const int StatusClosedApproved     = 3;

        private const int StateAvailable          = 1;
        private const int StateCheckedOut         = 2;
        private const int StateAwaitingValidation = 3;

        private const int SheetStateAvailable          = 2;
        private const int SheetStateAwaitingValidation = 4;

        public SubmitRevisionPlugin() : base(typeof(SubmitRevisionPlugin)) { }
        public SubmitRevisionPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(SubmitRevisionPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.InitiatingUserService;

            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as EntityReference : null;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");
            if (!string.Equals(target.LogicalName, CheckoutEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"Target must be {CheckoutEntity}, got {target.LogicalName}");

            string newRevision = context.InputParameters.Contains("NewRevision")
                ? context.InputParameters["NewRevision"] as string : null;
            if (string.IsNullOrWhiteSpace(newRevision))
                throw new InvalidPluginExecutionException("Missing required input: NewRevision");
            newRevision = newRevision.Trim();

            Entity checkout;
            try
            {
                checkout = service.Retrieve(CheckoutEntity, target.Id,
                    new ColumnSet(ColCheckoutStatus, ColCheckoutDrawing));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException($"Could not retrieve checkout {target.Id}: {ex.Message}", ex);
            }

            int currentStatus = checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus)?.Value ?? 0;
            if (currentStatus != StatusOpen)
                throw new InvalidPluginExecutionException(
                    $"Checkout {target.Id} cannot accept a revision from status {currentStatus}. Expected {StatusOpen} (Open).");

            var drawingRef = checkout.GetAttributeValue<EntityReference>(ColCheckoutDrawing);
            if (drawingRef == null)
                throw new InvalidPluginExecutionException($"Checkout {target.Id} has no associated drawing.");

            Entity drawing = service.Retrieve(DrawingEntity, drawingRef.Id, new ColumnSet(ColDrawingState));
            int drawingStateNow = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
            if (drawingStateNow != StateCheckedOut)
                throw new InvalidPluginExecutionException(
                    $"Drawing {drawingRef.Id} must be CheckedOut ({StateCheckedOut}) to submit a revision; was {drawingStateNow}.");

            bool requireApproval = GetRequireCheckInApproval(service);

            int targetDrawingState = requireApproval ? StateAwaitingValidation : StateAvailable;
            int targetSheetState   = requireApproval ? SheetStateAwaitingValidation : SheetStateAvailable;
            int targetStatus       = requireApproval ? StatusAwaitingValidation : StatusClosedApproved;

            // Drawing update first — RowVersion concurrency serializes the race.
            var drawingUpdate = new Entity(DrawingEntity, drawingRef.Id)
            {
                RowVersion        = drawing.RowVersion,
                [ColDrawingState] = new OptionSetValue(targetDrawingState),
            };
            if (!requireApproval) drawingUpdate[ColCurrentRevision] = newRevision;

            try
            {
                service.Execute(new UpdateRequest
                {
                    Target              = drawingUpdate,
                    ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
                });
            }
            catch (FaultException<OrganizationServiceFault> ex)
                when (ex.Detail?.ErrorCode == -2147088254 ||
                      (ex.Message != null && ex.Message.Contains("ConcurrencyVersionMismatch")))
            {
                throw new InvalidPluginExecutionException(
                    $"Drawing {drawingRef.Id} was concurrently modified (ConcurrencyVersionMismatch). Retry.", ex);
            }

            // Checkout update.
            var checkoutUpdate = new Entity(CheckoutEntity, target.Id)
            {
                [ColCheckoutStatus] = new OptionSetValue(targetStatus),
                [ColNewRevision]    = newRevision,
            };
            if (!requireApproval)
            {
                checkoutUpdate["enmax_acdnclosedon"] = DateTime.UtcNow;
                checkoutUpdate["enmax_acdnclosedby"] = new EntityReference("systemuser", context.InitiatingUserId);
            }
            service.Update(checkoutUpdate);

            // Sheets follow.
            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, drawingRef.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(targetSheetState) });

            // Audit keyed to the drawing.
            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventStateChanged),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = drawingRef.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdnfromstate"]    = "CheckedOut",
                ["enmax_acdntostate"]      = requireApproval ? "AwaitingValidation" : "Available",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Drawing {drawingRef.Id} revision {newRevision} submitted",
            });

            context.OutputParameters["NewStatus"]    = targetStatus;
            context.OutputParameters["DrawingState"] = targetDrawingState;
        }

        private static bool GetRequireCheckInApproval(IOrganizationService service)
        {
            var q = new QueryExpression(AppConfigEntity) { ColumnSet = new ColumnSet(ColAppConfigValue), TopCount = 1 };
            q.Criteria.AddCondition(ColAppConfigKey, ConditionOperator.Equal, "RequireCheckInApproval");
            var results = service.RetrieveMultiple(q);
            if (results.Entities.Count == 0) return false;
            return bool.TryParse(results.Entities[0].GetAttributeValue<string>(ColAppConfigValue), out var v) && v;
        }
    }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~SubmitRevisionPluginTests" --configuration Release
```

Expected: all 7 SubmitRevisionPluginTests PASS.

- [ ] **Step 5: Commit**

```bash
git add solution/plugins/IssueNumbers/SubmitRevisionPlugin.cs solution/plugins/IssueNumbers.Tests/SubmitRevisionPluginTests.cs
git commit -m "feat(plan-12): add SubmitRevisionPlugin (atomic, AppConfig-gated, concurrency-safe)"
```

---

## Task 5: ApproveCheckinPlugin — fix audit subject, propagate sheets, idempotency

**Files:**
- Modify: `solution/plugins/IssueNumbers/ApproveCheckinPlugin.cs`
- Test: `solution/plugins/IssueNumbers.Tests/ApproveCheckinPluginTests.cs`

Per spec §4.4: audit `subjectid` is currently `target.Id` (checkout) — change to `drawingRef.Id`. Add sheet propagation (approved → Available 2; declined → CheckedOut 3). Add idempotency: if already ClosedApproved, return success silently.

- [ ] **Step 1: Write failing tests**

Append to `ApproveCheckinPluginTests.cs`:

```csharp
[Fact]
public void Approve_audit_is_keyed_to_the_drawing()
{
    var (ctx, pluginCtx, _, drawingId) = BuildContext();
    pluginCtx.InputParameters["Decision"] = DecisionApproved;

    ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

    var audit = ctx.GetFakedOrganizationService()
        .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) })
        .Entities[0];
    audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString(),
        because: "audit must reference the drawing, not the checkout, so it appears on the drawing timeline");
    audit.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be(DrawingEntity);
}

[Fact]
public void Approve_moves_sheets_to_Available()
{
    var (ctx, pluginCtx, _, drawingId) = BuildContextWithSheet();
    pluginCtx.InputParameters["Decision"] = DecisionApproved;

    ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

    var sheets = ctx.GetFakedOrganizationService()
        .RetrieveMultiple(new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") });
    sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 2,
        because: "approved revision returns sheets to sheet Available = 2");
}

[Fact]
public void Decline_moves_sheets_back_to_CheckedOut()
{
    var (ctx, pluginCtx, _, _) = BuildContextWithSheet();
    pluginCtx.InputParameters["Decision"] = DecisionDeclined;
    pluginCtx.InputParameters["Reason"]   = "Missing revision marks on pages 3 and 4.";

    ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

    var sheets = ctx.GetFakedOrganizationService()
        .RetrieveMultiple(new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") });
    sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 3,
        because: "declined revision reverts sheets to sheet CheckedOut = 3");
}

[Fact]
public void Already_ClosedApproved_checkout_is_idempotent_noop()
{
    var (ctx, pluginCtx, checkoutId, _) = BuildContext(checkoutStatus: StatusClosedApproved);
    pluginCtx.InputParameters["Decision"] = DecisionApproved;

    Action act = () => ctx.ExecutePluginWith<ApproveCheckinPlugin>(pluginCtx);

    act.Should().NotThrow(because: "re-approving an already-approved checkout must be a silent success (idempotent)");
    var checkout = ctx.GetFakedOrganizationService()
        .Retrieve(CheckoutEntity, checkoutId, new ColumnSet(ColCheckoutStatus));
    checkout.GetAttributeValue<OptionSetValue>(ColCheckoutStatus).Value.Should().Be(StatusClosedApproved);
}
```

Add a `BuildContextWithSheet` helper next to the existing `BuildContext` (seeds one sheet at state 3 linked to the drawing):

```csharp
private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid checkoutId, Guid drawingId)
    BuildContextWithSheet(int checkoutStatus = StatusAwaitingValidation, string newRevision = "B")
{
    var (ctx, pluginCtx, checkoutId, drawingId) = BuildContext(checkoutStatus, newRevision);
    var sheet = new Entity("enmax_autocadsheet", Guid.NewGuid())
    {
        ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
        ["enmax_acdnstate"]   = new OptionSetValue(4), // sheet AwaitingValidation
    };
    ctx.GetFakedOrganizationService().Create(sheet);
    return (ctx, pluginCtx, checkoutId, drawingId);
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~ApproveCheckinPluginTests" --configuration Release
```

Expected: the 4 new tests FAIL (audit keyed to checkout; sheets untouched; no idempotency).

- [ ] **Step 3: Implement fixes**

In `ApproveCheckinPlugin.cs`, add sheet constants:
```csharp
        private const string SheetEntity            = "enmax_autocadsheet";
        private const string ColSheetDrawing        = "enmax_acdndrawing";
        private const string ColSheetState           = "enmax_acdnstate";
        private const int    SheetStateAvailable     = 2;
        private const int    SheetStateCheckedOut    = 3;
```

After `int currentStatus = ...` and BEFORE the existing AwaitingValidation guard, add the idempotency shortcut:

```csharp
            if (currentStatus == StatusClosedApproved)
            {
                localPluginContext.Trace($"Checkout {target.Id} already ClosedApproved — idempotent no-op.");
                context.OutputParameters["CheckoutId"]   = target.Id.ToString();
                context.OutputParameters["NewStatus"]    = StatusClosedApproved;
                context.OutputParameters["DrawingState"] = StateAvailable;
                return;
            }
```

In the approved branch, after `service.Update(drawingUpdate);`, add sheet propagation:
```csharp
                PropagateSheetState(service, drawingRef.Id, SheetStateAvailable);
```

In the declined branch, after the drawing revert `service.Update(new Entity(DrawingEntity, drawingRef.Id) { [ColDrawingState] = new OptionSetValue(StateCheckedOut) });`, add:
```csharp
                PropagateSheetState(service, drawingRef.Id, SheetStateCheckedOut);
```

In the audit `service.Create(new Entity(AuditEntity) {...})` block, change the subject + state labels from checkout-centric to drawing-centric:
```csharp
                ["enmax_acdnsubjectid"]    = drawingRef.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdnfromstate"]    = "AwaitingValidation",
                ["enmax_acdntostate"]      = decision == DecisionApproved ? "Available" : "CheckedOut",
```

Add the private helper at the end of the class:
```csharp
        private static void PropagateSheetState(IOrganizationService service, Guid drawingId, int sheetState)
        {
            var q = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            q.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, drawingId);
            foreach (var sheet in service.RetrieveMultiple(q).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(sheetState) });
        }
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~ApproveCheckinPluginTests" --configuration Release
```

Expected: all ApproveCheckinPluginTests PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add solution/plugins/IssueNumbers/ApproveCheckinPlugin.cs solution/plugins/IssueNumbers.Tests/ApproveCheckinPluginTests.cs
git commit -m "feat(plan-12): ApproveCheckin keys audit to drawing, propagates sheets, adds idempotency"
```

---

## Task 6: ForceCheckinPlugin — add NewRevision, fix audit subject, propagate sheets

**Files:**
- Modify: `solution/plugins/IssueNumbers/ForceCheckinPlugin.cs`
- Test: `solution/plugins/IssueNumbers.Tests/ForceCheckinPluginTests.cs`

Per spec §4.4: add required `NewRevision` input, bump `enmax_acdncurrentrevision`, fix audit `subjectid`→drawing, propagate sheets → Available(2). Drawing update gets RowVersion concurrency.

- [ ] **Step 1: Update existing tests + add new ones**

In `ForceCheckinPluginTests.cs`, the `BuildContext` helper sets `Reason` but not `NewRevision`. Add the line in `BuildContext` after the `Reason` input:
```csharp
            pluginCtx.InputParameters["NewRevision"] = "C";
```

Append these tests:

```csharp
[Fact]
public void ForceCheckin_bumps_revision_on_drawing()
{
    var (ctx, pluginCtx, _, drawingId) = BuildContext(StatusOpen);

    ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

    var drawing = ctx.GetFakedOrganizationService()
        .Retrieve(DrawingEntity, drawingId, new ColumnSet("enmax_acdncurrentrevision"));
    drawing.GetAttributeValue<string>("enmax_acdncurrentrevision").Should().Be("C",
        because: "force check-in must stamp the admin-provided revision on the drawing");
}

[Fact]
public void ForceCheckin_audit_is_keyed_to_the_drawing()
{
    var (ctx, pluginCtx, _, drawingId) = BuildContext(StatusOpen);

    ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

    var audit = ctx.GetFakedOrganizationService()
        .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) })
        .Entities[0];
    audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString(),
        because: "force check-in audit must appear on the drawing timeline");
    audit.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be(DrawingEntity);
}

[Fact]
public void ForceCheckin_moves_sheets_to_Available()
{
    var ctx        = new XrmFakedContext();
    var drawingId  = Guid.NewGuid();
    var checkoutId = Guid.NewGuid();
    var drawing  = new Entity(DrawingEntity, drawingId)  { [ColDrawingState] = new OptionSetValue(StateCheckedOut) };
    var checkout = new Entity(CheckoutEntity, checkoutId)
    {
        [ColCheckoutStatus]  = new OptionSetValue(StatusOpen),
        [ColCheckoutDrawing] = new EntityReference(DrawingEntity, drawingId),
    };
    var sheet = new Entity("enmax_autocadsheet", Guid.NewGuid())
    {
        ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
        ["enmax_acdnstate"]   = new OptionSetValue(3),
    };
    ctx.Initialize(new[] { drawing, checkout, sheet });
    var pluginCtx = ctx.GetDefaultPluginContext();
    pluginCtx.MessageName      = "enmax_acdnForceCheckin";
    pluginCtx.Stage            = 40;
    pluginCtx.InitiatingUserId = Guid.NewGuid();
    pluginCtx.InputParameters  = new ParameterCollection();
    pluginCtx.OutputParameters = new ParameterCollection();
    pluginCtx.InputParameters["Target"]      = new EntityReference(CheckoutEntity, checkoutId);
    pluginCtx.InputParameters["Reason"]      = ValidReason;
    pluginCtx.InputParameters["NewRevision"] = "C";

    ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

    var sheets = ctx.GetFakedOrganizationService()
        .RetrieveMultiple(new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") });
    sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 2,
        because: "force check-in returns sheets to sheet Available = 2");
}

[Fact]
public void Missing_NewRevision_throws()
{
    var (ctx, pluginCtx, _, _) = BuildContext(StatusOpen);
    pluginCtx.InputParameters["NewRevision"] = string.Empty;

    Action act = () => ctx.ExecutePluginWith<ForceCheckinPlugin>(pluginCtx);

    act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*NewRevision*",
        because: "an admin force check-in must record the revision being finalised");
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~ForceCheckinPluginTests" --configuration Release
```

Expected: new tests FAIL.

- [ ] **Step 3: Implement**

In `ForceCheckinPlugin.cs`, add constants:
```csharp
        private const string ColCurrentRevision     = "enmax_acdncurrentrevision";
        private const string SheetEntity             = "enmax_autocadsheet";
        private const string ColSheetDrawing         = "enmax_acdndrawing";
        private const string ColSheetState            = "enmax_acdnstate";
        private const int    SheetStateAvailable      = 2;
```

After reading `reason`, add NewRevision validation:
```csharp
            string newRevision = context.InputParameters.Contains("NewRevision")
                ? context.InputParameters["NewRevision"] as string : null;
            if (string.IsNullOrWhiteSpace(newRevision))
                throw new InvalidPluginExecutionException("Missing required input: NewRevision");
            newRevision = newRevision.Trim();
```

Replace the drawing update (the `service.Update(new Entity(DrawingEntity, drawingRef.Id) { [ColDrawingState] = new OptionSetValue(StateAvailable) });` block) with a RowVersion-guarded update that also bumps the revision, then propagates sheets:

```csharp
            // Retrieve drawing for RowVersion concurrency
            var drawing = service.Retrieve(DrawingEntity, drawingRef.Id, new ColumnSet(ColDrawingState));
            try
            {
                service.Execute(new UpdateRequest
                {
                    Target = new Entity(DrawingEntity, drawingRef.Id)
                    {
                        RowVersion           = drawing.RowVersion,
                        [ColDrawingState]    = new OptionSetValue(StateAvailable),
                        [ColCurrentRevision] = newRevision,
                    },
                    ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
                });
            }
            catch (FaultException<OrganizationServiceFault> ex)
                when (ex.Detail?.ErrorCode == -2147088254 ||
                      (ex.Message != null && ex.Message.Contains("ConcurrencyVersionMismatch")))
            {
                throw new InvalidPluginExecutionException(
                    $"Drawing {drawingRef.Id} was concurrently modified (ConcurrencyVersionMismatch). Retry.", ex);
            }

            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, drawingRef.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(SheetStateAvailable) });
```

Add the required `using Microsoft.Xrm.Sdk.Messages;` at the top if absent.

In the audit `service.Create(...)` block, fix subject + states:
```csharp
                ["enmax_acdnsubjectid"]    = drawingRef.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdnfromstate"]    = "CheckedOut",
                ["enmax_acdntostate"]      = "Available",
```

> Note: the idempotent already-closed shortcut at the top runs before `drawingRef` is read; leave it as-is (it returns before touching the drawing).

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~ForceCheckinPluginTests" --configuration Release
```

Expected: all ForceCheckinPluginTests PASS.

- [ ] **Step 5: Commit**

```bash
git add solution/plugins/IssueNumbers/ForceCheckinPlugin.cs solution/plugins/IssueNumbers.Tests/ForceCheckinPluginTests.cs
git commit -m "feat(plan-12): ForceCheckin takes NewRevision, keys audit to drawing, propagates sheets"
```

---

## Task 7: FinalizeDrawingPlugin — NEW terminal-state plugin

**Files:**
- Create: `solution/plugins/IssueNumbers/FinalizeDrawingPlugin.cs`
- Create: `solution/plugins/IssueNumbers.Tests/FinalizeDrawingPluginTests.cs`

Per spec §4.3. Custom API `enmax_acdnFinalizeDrawing` (bound to `enmax_autocaddrawing`). Guard: drawing must be Available(1). Reason required (≥10 chars). Drawing → Finalized(7) with RowVersion; sheets → Finalized(7); audit event=9.

- [ ] **Step 1: Write failing tests**

Create `FinalizeDrawingPluginTests.cs`:

```csharp
using Enmax.AutoCAD;
using FakeXrmEasy;
using FakeXrmEasy.FakeMessageExecutors;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Unit tests for FinalizeDrawingPlugin.
    /// Custom API: enmax_acdnFinalizeDrawing (bound to enmax_autocaddrawing)
    /// </summary>
    public class FinalizeDrawingPluginTests
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColDrawingState = "enmax_acdnstate";

        private const int StateAvailable  = 1;
        private const int StateCheckedOut = 2;
        private const int StateFinalized  = 7;

        private const string ValidReason = "This is the final issued-for-construction revision; no further changes expected.";

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid drawingId)
            BuildContext(int drawingState = StateAvailable)
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var userId    = Guid.NewGuid();

            var drawing = new Entity(DrawingEntity, drawingId) { [ColDrawingState] = new OptionSetValue(drawingState) };
            var sheet   = new Entity(SheetEntity, Guid.NewGuid())
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(2),
            };
            ctx.Initialize(new[] { drawing, sheet });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnFinalizeDrawing";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = userId;
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);
            pluginCtx.InputParameters["Reason"] = ValidReason;

            return (ctx, pluginCtx, drawingId);
        }

        [Fact]
        public void Available_drawing_transitions_to_Finalized()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);

            ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);

            var drawing = ctx.GetFakedOrganizationService()
                .Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState));
            drawing.GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StateFinalized,
                because: "finalising an Available drawing must move it to the terminal Finalized state");
        }

        [Fact]
        public void Finalize_moves_sheets_to_Finalized()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable);

            ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);

            var sheets = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_acdnstate") });
            sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 7,
                because: "sheets mirror the drawing into Finalized = 7");
        }

        [Fact]
        public void Finalize_writes_Finalized_audit_keyed_to_drawing_with_reason()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);

            ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);

            var audit = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) })
                .Entities[0];
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(9, because: "event 9 = Finalized");
            audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString());
            audit.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be(DrawingEntity);
            audit.GetAttributeValue<string>("enmax_acdnreason").Should().NotBeNullOrEmpty(
                because: "the finalisation reason must be persisted for the audit trail");
        }

        [Fact]
        public void Non_Available_drawing_throws()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateCheckedOut);

            Action act = () => ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>().WithMessage($"*{StateCheckedOut}*",
                because: "only an Available drawing can be finalised; the message must include the current state");
        }

        [Fact]
        public void Short_reason_throws()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable);
            pluginCtx.InputParameters["Reason"] = "too short";

            Action act = () => ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*10*",
                because: "finalisation reason must be at least 10 characters");
        }

        [Fact]
        public void ConcurrencyVersionMismatch_propagates_to_caller()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable);
            var fault = new OrganizationServiceFault { ErrorCode = -2147088254, Message = "ConcurrencyVersionMismatch" };
            ctx.AddFakeMessageExecutor<UpdateRequest>(
                new AlwaysThrowUpdateExecutor(new FaultException<OrganizationServiceFault>(fault, fault.Message)));

            Action act = () => ctx.ExecutePluginWith<FinalizeDrawingPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*ConcurrencyVersionMismatch*",
                because: "two simultaneous finalisations must not both succeed; the loser must be told to retry");
        }
    }
}
```

> `AlwaysThrowUpdateExecutor` already exists in the test project (used by `CheckOutDrawingPluginTests`). If it lives in a different namespace, add the matching `using`.

- [ ] **Step 2: Run tests — expect FAIL (type missing)**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~FinalizeDrawingPluginTests" --configuration Release
```

Expected: build error — `FinalizeDrawingPlugin` does not exist.

- [ ] **Step 3: Implement the plugin**

Create `FinalizeDrawingPlugin.cs`:

```csharp
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in to finalize a drawing (terminal state).
    /// Custom API: enmax_acdnFinalizeDrawing (bound to enmax_autocaddrawing)
    ///
    /// Guard: drawing must be Available(1). Drawing -> Finalized(7) with RowVersion concurrency;
    /// sheets -> Finalized(7); audit event=9 keyed to drawingId with the supplied reason.
    /// </summary>
    public class FinalizeDrawingPlugin : PluginBase
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string ColDrawingState = "enmax_acdnstate";

        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColSheetDrawing = "enmax_acdndrawing";
        private const string ColSheetState   = "enmax_acdnstate";

        private const string AuditEntity        = "enmax_autocadauditevent";
        private const int    AuditEventFinalized = 9;
        private const int    AuditSourceAction   = 4;

        private const int StateAvailable  = 1;
        private const int StateFinalized  = 7;
        private const int SheetStateFinalized = 7;

        public FinalizeDrawingPlugin() : base(typeof(FinalizeDrawingPlugin)) { }
        public FinalizeDrawingPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(FinalizeDrawingPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.InitiatingUserService;

            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as EntityReference : null;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");
            if (!string.Equals(target.LogicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"Target must be {DrawingEntity}, got {target.LogicalName}");

            string reason = context.InputParameters.Contains("Reason")
                ? context.InputParameters["Reason"] as string ?? string.Empty : string.Empty;
            if (reason.Trim().Length < 10)
                throw new InvalidPluginExecutionException("Reason must be at least 10 characters to finalize a drawing.");

            Entity drawing;
            try
            {
                drawing = service.Retrieve(DrawingEntity, target.Id, new ColumnSet(ColDrawingState));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException($"Could not retrieve drawing {target.Id}: {ex.Message}", ex);
            }

            int currentState = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
            if (currentState != StateAvailable)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} cannot be finalized from state {currentState}. Expected {StateAvailable} (Available).");

            try
            {
                service.Execute(new UpdateRequest
                {
                    Target = new Entity(DrawingEntity, target.Id)
                    {
                        RowVersion        = drawing.RowVersion,
                        [ColDrawingState] = new OptionSetValue(StateFinalized),
                    },
                    ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
                });
            }
            catch (FaultException<OrganizationServiceFault> ex)
                when (ex.Detail?.ErrorCode == -2147088254 ||
                      (ex.Message != null && ex.Message.Contains("ConcurrencyVersionMismatch")))
            {
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} was concurrently modified (ConcurrencyVersionMismatch). Retry.", ex);
            }

            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, target.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(SheetStateFinalized) });

            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventFinalized),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdnfromstate"]    = "Available",
                ["enmax_acdntostate"]      = "Finalized",
                ["enmax_acdnreason"]       = reason.Trim(),
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Drawing {target.Id} finalized",
            });
        }
    }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~FinalizeDrawingPluginTests" --configuration Release
```

Expected: all 6 FinalizeDrawingPluginTests PASS.

- [ ] **Step 5: Commit**

```bash
git add solution/plugins/IssueNumbers/FinalizeDrawingPlugin.cs solution/plugins/IssueNumbers.Tests/FinalizeDrawingPluginTests.cs
git commit -m "feat(plan-12): add FinalizeDrawingPlugin (terminal state, concurrency-safe, audit=9)"
```

---

## Task 8: MarkObsoletePlugin + MarkVoidPlugin — NEW admin terminal plugins

**Files:**
- Create: `solution/plugins/IssueNumbers/MarkObsoletePlugin.cs`
- Create: `solution/plugins/IssueNumbers/MarkVoidPlugin.cs`
- Create: `solution/plugins/IssueNumbers.Tests/MarkObsoletePluginTests.cs`
- Create: `solution/plugins/IssueNumbers.Tests/MarkVoidPluginTests.cs`

Per spec §4.3. Both bound to `enmax_autocaddrawing`. Guard: drawing non-terminal (not 5/6/7). Obsolete → 5 (reason optional); Void → 6 (reason required ≥10). Sheets mirror (Obsolete 5 / Void 6). Audit event=2 with `enmax_acdntostate` populated.

- [ ] **Step 1: Write failing tests — MarkObsolete**

Create `MarkObsoletePluginTests.cs`:

```csharp
using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class MarkObsoletePluginTests
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColDrawingState = "enmax_acdnstate";
        private const int StateAvailable = 1;
        private const int StateObsolete  = 5;
        private const int StateVoid      = 6;
        private const int StateFinalized = 7;

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid drawingId)
            BuildContext(int drawingState = StateAvailable)
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var drawing = new Entity(DrawingEntity, drawingId) { [ColDrawingState] = new OptionSetValue(drawingState) };
            var sheet   = new Entity(SheetEntity, Guid.NewGuid())
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(2),
            };
            ctx.Initialize(new[] { drawing, sheet });
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnMarkObsolete";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = Guid.NewGuid();
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);
            pluginCtx.InputParameters["Reason"] = string.Empty;
            return (ctx, pluginCtx, drawingId);
        }

        [Fact]
        public void NonTerminal_drawing_becomes_Obsolete_with_sheets_mirrored()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);

            ctx.ExecutePluginWith<MarkObsoletePlugin>(pluginCtx);

            var svc = ctx.GetFakedOrganizationService();
            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
               .GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StateObsolete);
            svc.RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_acdnstate") })
               .Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 5,
                   because: "sheet Obsolete = 5 mirrors the drawing");
        }

        [Fact]
        public void Obsolete_writes_StateChanged_audit_to_drawing()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);

            ctx.ExecutePluginWith<MarkObsoletePlugin>(pluginCtx);

            var audit = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) })
                .Entities[0];
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(2, because: "event 2 = State Changed");
            audit.GetAttributeValue<string>("enmax_acdntostate").Should().Be("Obsolete");
            audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString());
        }

        [Theory]
        [InlineData(StateObsolete)]
        [InlineData(StateVoid)]
        [InlineData(StateFinalized)]
        public void Terminal_drawing_throws(int terminalState)
        {
            var (ctx, pluginCtx, _) = BuildContext(terminalState);

            Action act = () => ctx.ExecutePluginWith<MarkObsoletePlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>(
                because: "a terminal drawing (Obsolete/Void/Finalized) cannot be marked obsolete");
        }
    }
}
```

- [ ] **Step 2: Write failing tests — MarkVoid**

Create `MarkVoidPluginTests.cs` (same shape, plus the required-reason guard):

```csharp
using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class MarkVoidPluginTests
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColDrawingState = "enmax_acdnstate";
        private const int StateAvailable = 1;
        private const int StateVoid      = 6;
        private const int StateFinalized = 7;
        private const string ValidReason = "Reservation was cancelled by the requesting business; drawing no longer required.";

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid drawingId)
            BuildContext(int drawingState = StateAvailable, string reason = ValidReason)
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var drawing = new Entity(DrawingEntity, drawingId) { [ColDrawingState] = new OptionSetValue(drawingState) };
            var sheet   = new Entity(SheetEntity, Guid.NewGuid())
            {
                ["enmax_acdndrawing"] = new EntityReference(DrawingEntity, drawingId),
                ["enmax_acdnstate"]   = new OptionSetValue(2),
            };
            ctx.Initialize(new[] { drawing, sheet });
            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnMarkVoid";
            pluginCtx.Stage            = 40;
            pluginCtx.InitiatingUserId = Guid.NewGuid();
            pluginCtx.InputParameters  = new ParameterCollection();
            pluginCtx.OutputParameters = new ParameterCollection();
            pluginCtx.InputParameters["Target"] = new EntityReference(DrawingEntity, drawingId);
            pluginCtx.InputParameters["Reason"] = reason;
            return (ctx, pluginCtx, drawingId);
        }

        [Fact]
        public void NonTerminal_drawing_becomes_Void_with_sheets_mirrored_and_reason_audited()
        {
            var (ctx, pluginCtx, drawingId) = BuildContext(StateAvailable);

            ctx.ExecutePluginWith<MarkVoidPlugin>(pluginCtx);

            var svc = ctx.GetFakedOrganizationService();
            svc.Retrieve(DrawingEntity, drawingId, new ColumnSet(ColDrawingState))
               .GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StateVoid);
            svc.RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_acdnstate") })
               .Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 6);
            var audit = svc.RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) }).Entities[0];
            audit.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value.Should().Be(2);
            audit.GetAttributeValue<string>("enmax_acdntostate").Should().Be("Void");
            audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(drawingId.ToString());
            audit.GetAttributeValue<string>("enmax_acdnreason").Should().NotBeNullOrEmpty();
        }

        [Fact]
        public void Short_reason_throws()
        {
            var (ctx, pluginCtx, _) = BuildContext(StateAvailable, reason: "nope");

            Action act = () => ctx.ExecutePluginWith<MarkVoidPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*10*",
                because: "void requires a reason of at least 10 characters");
        }

        [Theory]
        [InlineData(StateVoid)]
        [InlineData(StateFinalized)]
        public void Terminal_drawing_throws(int terminalState)
        {
            var (ctx, pluginCtx, _) = BuildContext(terminalState);

            Action act = () => ctx.ExecutePluginWith<MarkVoidPlugin>(pluginCtx);

            act.Should().Throw<InvalidPluginExecutionException>();
        }
    }
}
```

- [ ] **Step 3: Run tests — expect FAIL (types missing)**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~MarkObsoletePluginTests|FullyQualifiedName~MarkVoidPluginTests" --configuration Release
```

Expected: build errors — plugins don't exist.

- [ ] **Step 4: Implement MarkObsoletePlugin**

Create `MarkObsoletePlugin.cs`:

```csharp
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Admin: mark a drawing Obsolete ("do not use"). Terminal.
    /// Custom API: enmax_acdnMarkObsolete (bound to enmax_autocaddrawing)
    /// Guard: drawing non-terminal (not 5/6/7). Reason optional.
    /// </summary>
    public class MarkObsoletePlugin : PluginBase
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string ColDrawingState = "enmax_acdnstate";
        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColSheetDrawing = "enmax_acdndrawing";
        private const string ColSheetState   = "enmax_acdnstate";
        private const string AuditEntity            = "enmax_autocadauditevent";
        private const int    AuditEventStateChanged = 2;
        private const int    AuditSourceAction      = 4;
        private const int    StateObsolete      = 5;
        private const int    StateVoid          = 6;
        private const int    StateFinalized     = 7;
        private const int    SheetStateObsolete = 5;

        public MarkObsoletePlugin() : base(typeof(MarkObsoletePlugin)) { }
        public MarkObsoletePlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(MarkObsoletePlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.InitiatingUserService;

            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as EntityReference : null;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");
            if (!string.Equals(target.LogicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"Target must be {DrawingEntity}, got {target.LogicalName}");

            string reason = context.InputParameters.Contains("Reason")
                ? context.InputParameters["Reason"] as string ?? string.Empty : string.Empty;

            var drawing = service.Retrieve(DrawingEntity, target.Id, new ColumnSet(ColDrawingState));
            int currentState = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
            if (currentState == StateObsolete || currentState == StateVoid || currentState == StateFinalized)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} is already terminal (state {currentState}); cannot mark obsolete.");

            try
            {
                service.Execute(new UpdateRequest
                {
                    Target = new Entity(DrawingEntity, target.Id)
                    {
                        RowVersion        = drawing.RowVersion,
                        [ColDrawingState] = new OptionSetValue(StateObsolete),
                    },
                    ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
                });
            }
            catch (FaultException<OrganizationServiceFault> ex)
                when (ex.Detail?.ErrorCode == -2147088254 ||
                      (ex.Message != null && ex.Message.Contains("ConcurrencyVersionMismatch")))
            {
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} was concurrently modified (ConcurrencyVersionMismatch). Retry.", ex);
            }

            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, target.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(SheetStateObsolete) });

            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventStateChanged),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdntostate"]      = "Obsolete",
                ["enmax_acdnreason"]       = reason,
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Drawing {target.Id} marked obsolete",
            });
        }
    }
}
```

- [ ] **Step 5: Implement MarkVoidPlugin**

Create `MarkVoidPlugin.cs` — identical structure to MarkObsolete with these differences: class/ctor names `MarkVoidPlugin`, `StateVoid = 6` / `SheetStateVoid = 6` as the targets, a required-reason guard, and audit `tostate = "Void"`:

```csharp
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Admin: mark a drawing Void (cancelled). Terminal.
    /// Custom API: enmax_acdnMarkVoid (bound to enmax_autocaddrawing)
    /// Guard: drawing non-terminal (not 5/6/7). Reason required (>=10 chars).
    /// </summary>
    public class MarkVoidPlugin : PluginBase
    {
        private const string DrawingEntity   = "enmax_autocaddrawing";
        private const string ColDrawingState = "enmax_acdnstate";
        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColSheetDrawing = "enmax_acdndrawing";
        private const string ColSheetState   = "enmax_acdnstate";
        private const string AuditEntity            = "enmax_autocadauditevent";
        private const int    AuditEventStateChanged = 2;
        private const int    AuditSourceAction      = 4;
        private const int    StateObsolete  = 5;
        private const int    StateVoid      = 6;
        private const int    StateFinalized = 7;
        private const int    SheetStateVoid = 6;

        public MarkVoidPlugin() : base(typeof(MarkVoidPlugin)) { }
        public MarkVoidPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(MarkVoidPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.InitiatingUserService;

            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as EntityReference : null;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");
            if (!string.Equals(target.LogicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"Target must be {DrawingEntity}, got {target.LogicalName}");

            string reason = context.InputParameters.Contains("Reason")
                ? context.InputParameters["Reason"] as string ?? string.Empty : string.Empty;
            if (reason.Trim().Length < 10)
                throw new InvalidPluginExecutionException("Reason must be at least 10 characters to void a drawing.");

            var drawing = service.Retrieve(DrawingEntity, target.Id, new ColumnSet(ColDrawingState));
            int currentState = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
            if (currentState == StateObsolete || currentState == StateVoid || currentState == StateFinalized)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} is already terminal (state {currentState}); cannot void.");

            try
            {
                service.Execute(new UpdateRequest
                {
                    Target = new Entity(DrawingEntity, target.Id)
                    {
                        RowVersion        = drawing.RowVersion,
                        [ColDrawingState] = new OptionSetValue(StateVoid),
                    },
                    ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
                });
            }
            catch (FaultException<OrganizationServiceFault> ex)
                when (ex.Detail?.ErrorCode == -2147088254 ||
                      (ex.Message != null && ex.Message.Contains("ConcurrencyVersionMismatch")))
            {
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} was concurrently modified (ConcurrencyVersionMismatch). Retry.", ex);
            }

            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, target.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(SheetStateVoid) });

            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventStateChanged),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdntostate"]      = "Void",
                ["enmax_acdnreason"]       = reason.Trim(),
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Drawing {target.Id} voided",
            });
        }
    }
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "FullyQualifiedName~MarkObsoletePluginTests|FullyQualifiedName~MarkVoidPluginTests" --configuration Release
```

Expected: all MarkObsolete + MarkVoid tests PASS.

- [ ] **Step 7: Run the FULL plugin unit suite — guard against regressions**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "Category!=Integration" --configuration Release
```

Expected: entire non-integration suite green.

- [ ] **Step 8: Commit**

```bash
git add solution/plugins/IssueNumbers/MarkObsoletePlugin.cs solution/plugins/IssueNumbers/MarkVoidPlugin.cs solution/plugins/IssueNumbers.Tests/MarkObsoletePluginTests.cs solution/plugins/IssueNumbers.Tests/MarkVoidPluginTests.cs
git commit -m "feat(plan-12): add MarkObsolete + MarkVoid admin terminal plugins"
```

---

## Task 9: Code App — `checkoutClient.ts` enum + API functions

**Files:**
- Modify: `apps/code-app/src/features/checkout/api/checkoutClient.ts`

Add `Finalized`, drop deprecated `CheckedIn`, route `submitRevision` through the new Custom API, add `newRevision` to force check-in, add finalize/obsolete/void calls, remove the obsolete client-side `checkIn` chain.

- [ ] **Step 1: Update `DrawingState` + labels/colors**

Replace the `DrawingState` const object with:

```ts
export const DrawingState = {
  None: 0,
  Available: 1,
  CheckedOut: 2,
  AwaitingValidation: 3,
  Obsolete: 5,
  Void: 6,
  Finalized: 7,
} as const;
```

Add exported label + badge maps directly under `DrawingStateValue`:

```ts
export type BadgeColor = "success" | "warning" | "informative" | "brand" | "subtle" | "danger";

export const DRAWING_STATE_LABELS: Record<number, string> = {
  0: "Unknown",
  1: "Available",
  2: "Checked Out",
  3: "Awaiting Validation",
  5: "Obsolete",
  6: "Void",
  7: "Finalized",
};

export const DRAWING_STATE_BADGE_COLOR: Record<number, BadgeColor> = {
  0: "subtle",
  1: "success",
  2: "warning",
  3: "informative",
  5: "danger",
  6: "danger",
  7: "brand",
};

export const TERMINAL_DRAWING_STATES: ReadonlySet<number> = new Set([5, 6, 7]);
```

> `danger` is the Fluent v9 `Badge` color for terminal/destructive states; if the installed Fluent version rejects it at the type level, fall back to `"important"`. Verify against the actual `BadgeProps["color"]` union when wiring components in Task 12.

- [ ] **Step 2: Route `submitRevision` through the Custom API**

Replace the entire `submitRevision` function (the two-PATCH version) and DELETE the `checkIn` function below it:

```ts
export interface SubmitRevisionInput {
  checkoutId: string;
  drawingId: string;
  newRevision: string;
  reason?: string;
}

export async function submitRevision(input: SubmitRevisionInput): Promise<void> {
  const result = await client.executeAsync<Record<string, unknown>, unknown>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnSubmitRevision",
        tableName: "enmax_autocadcheckouts",
        body: {
          checkoutId: input.checkoutId,
          NewRevision: input.newRevision,
          Reason: input.reason ?? "",
        },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Submit revision failed");
  }
}
```

> The `drawingId` field stays on `SubmitRevisionInput` because callers (the drawer + hook invalidation) need it even though the plugin derives the drawing from the checkout. The deprecated `checkIn` export is removed — its only caller (`SubmitRevisionDrawer` via `useCheckIn`) is rewired in Task 10/12.

- [ ] **Step 3: Add `newRevision` to force check-in**

Replace `ForceCheckinInput` + `forceCheckin`:

```ts
export interface ForceCheckinInput {
  checkoutId: string;
  drawingId: string;
  newRevision: string;
  reason: string;
}

export async function forceCheckin(input: ForceCheckinInput): Promise<void> {
  const result = await client.executeAsync<Record<string, unknown>, unknown>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnForceCheckin",
        tableName: "enmax_autocadcheckouts",
        body: {
          checkoutId: input.checkoutId,
          NewRevision: input.newRevision,
          Reason: input.reason,
        },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Force checkin failed");
  }
}
```

- [ ] **Step 4: Add finalize / obsolete / void calls**

Append (before `nextRevision`):

```ts
export interface FinalizeDrawingInput {
  drawingId: string;
  reason: string;
}

export async function finalizeDrawing(input: FinalizeDrawingInput): Promise<void> {
  const result = await client.executeAsync<Record<string, unknown>, unknown>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnFinalizeDrawing",
        tableName: "enmax_autocaddrawings",
        body: { drawingId: input.drawingId, Reason: input.reason },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Finalize failed");
  }
}

export interface MarkDrawingInput {
  drawingId: string;
  reason?: string;
}

export async function markObsolete(input: MarkDrawingInput): Promise<void> {
  const result = await client.executeAsync<Record<string, unknown>, unknown>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnMarkObsolete",
        tableName: "enmax_autocaddrawings",
        body: { drawingId: input.drawingId, Reason: input.reason ?? "" },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Mark obsolete failed");
  }
}

export async function markVoid(input: MarkDrawingInput): Promise<void> {
  const result = await client.executeAsync<Record<string, unknown>, unknown>({
    dataverseRequest: {
      action: "customapi",
      parameters: {
        operationName: "enmax_acdnMarkVoid",
        tableName: "enmax_autocaddrawings",
        body: { drawingId: input.drawingId, Reason: input.reason ?? "" },
      },
    },
  });
  if (!result.success) {
    const err = result.error as { message?: string } | undefined;
    throw new Error(err?.message ?? "Mark void failed");
  }
}
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/code-app && npx tsc --noEmit
```

Expected: errors ONLY in files that referenced the removed `checkIn` / `DrawingState.CheckedIn` (fixed in later tasks). Note them; do not fix unrelated files yet.

- [ ] **Step 6: Commit**

```bash
git add apps/code-app/src/features/checkout/api/checkoutClient.ts
git commit -m "feat(plan-12): checkoutClient — Finalized state, Custom-API submit/force, finalize/obsolete/void"
```

---

## Task 10: Code App — hooks (new + rewired)

**Files:**
- Create: `apps/code-app/src/features/checkout/hooks/useFinalizeDrawing.ts`
- Create: `apps/code-app/src/features/checkout/hooks/useMarkObsolete.ts`
- Create: `apps/code-app/src/features/checkout/hooks/useMarkVoid.ts`
- Modify: `apps/code-app/src/features/checkout/hooks/useSubmitRevision.ts`
- Modify: `apps/code-app/src/features/checkout/hooks/useForceCheckin.ts`
- Delete: `apps/code-app/src/features/checkout/hooks/useCheckIn.ts`

Per spec §6.4: every hook invalidates `["drawing", drawingId]` and `["search-drawings"]` on success; keep the existing reservation-panel keys so that surface refreshes too.

- [ ] **Step 1: Create `useFinalizeDrawing.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { finalizeDrawing } from "../api/checkoutClient";

export function useFinalizeDrawing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: finalizeDrawing,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["drawing", variables.drawingId] });
      void queryClient.invalidateQueries({ queryKey: ["search-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
    },
  });
}
```

- [ ] **Step 2: Create `useMarkObsolete.ts` and `useMarkVoid.ts`**

`useMarkObsolete.ts`:
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markObsolete } from "../api/checkoutClient";

export function useMarkObsolete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markObsolete,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["drawing", variables.drawingId] });
      void queryClient.invalidateQueries({ queryKey: ["search-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
    },
  });
}
```

`useMarkVoid.ts` — identical but imports/uses `markVoid`:
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markVoid } from "../api/checkoutClient";

export function useMarkVoid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markVoid,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["drawing", variables.drawingId] });
      void queryClient.invalidateQueries({ queryKey: ["search-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
    },
  });
}
```

- [ ] **Step 3: Rewire `useSubmitRevision.ts` + `useForceCheckin.ts`**

`useSubmitRevision.ts` — add the spec-required keys (keep existing):
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitRevision } from "../api/checkoutClient";

export function useSubmitRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitRevision,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["drawing", variables.drawingId] });
      void queryClient.invalidateQueries({ queryKey: ["search-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["checkouts"] });
    },
  });
}
```

`useForceCheckin.ts`:
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { forceCheckin } from "../api/checkoutClient";

export function useForceCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: forceCheckin,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["drawing", variables.drawingId] });
      void queryClient.invalidateQueries({ queryKey: ["search-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-drawings"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["checkouts"] });
      void queryClient.invalidateQueries({ queryKey: ["drawings"] });
    },
  });
}
```

- [ ] **Step 4: Delete `useCheckIn.ts`**

```bash
rm apps/code-app/src/features/checkout/hooks/useCheckIn.ts
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/code-app && npx tsc --noEmit
```

Expected: remaining errors only in `SubmitRevisionDrawer.tsx` (still imports `useCheckIn`) and `ForceCheckInDialog.tsx` (mutate args) — fixed in Task 11/12. No errors in the hook files themselves.

- [ ] **Step 6: Commit**

```bash
git add apps/code-app/src/features/checkout/hooks/
git commit -m "feat(plan-12): add finalize/obsolete/void hooks; rewire submit/force invalidations; drop useCheckIn"
```

---

## Task 11: Code App — new dialogs (Finalize, MarkVoid, MarkObsolete)

**Files:**
- Create: `apps/code-app/src/features/checkout/components/FinalizeDialog.tsx`
- Create: `apps/code-app/src/features/checkout/components/MarkVoidDialog.tsx`
- Create: `apps/code-app/src/features/checkout/components/MarkObsoleteDialog.tsx`

Per spec §6.3. Follow the established `ForceCheckInDialog` pattern (Fluent v9 `Dialog` + `Field`/`Textarea`, `mutation.reset()` on open, error line, spinner on pending).

> **Design discipline (memory `feedback_frontend_design_skill`):** before writing these components, invoke the `frontend-design` skill to confirm spacing/token/badge conventions. These dialogs reuse the exact `ForceCheckInDialog` visual language, so the skill pass is a quick conformance check, not a redesign.

- [ ] **Step 1: `FinalizeDialog.tsx` (reason required ≥10)**

```tsx
import { useState } from "react";
import {
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogContent, DialogActions,
  Button, Field, Textarea, Text, Spinner, tokens, makeStyles,
} from "@fluentui/react-components";
import { Checkmark24Regular } from "@fluentui/react-icons";
import { useFinalizeDrawing } from "../hooks/useFinalizeDrawing";

const useStyles = makeStyles({
  intro: { marginBottom: tokens.spacingVerticalM, color: tokens.colorNeutralForeground2 },
  error: { color: tokens.colorPaletteRedForeground1, display: "block", marginTop: tokens.spacingVerticalXS },
});

interface Props { drawingId: string; }

export function FinalizeDialog({ drawingId }: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useFinalizeDrawing();

  function handleOpen() { setReason(""); mutation.reset(); setOpen(true); }
  function handleConfirm() {
    if (reason.trim().length < 10) return;
    mutation.mutate({ drawingId, reason: reason.trim() }, { onSuccess: () => setOpen(false) });
  }

  return (
    <>
      <Button appearance="primary" icon={<Checkmark24Regular />} onClick={handleOpen}>Finalize</Button>
      <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) setOpen(false); }}>
        <DialogSurface>
          <DialogTitle>Finalize drawing</DialogTitle>
          <DialogBody>
            <DialogContent>
              <Text className={styles.intro}>
                Finalizing locks this drawing and its sheets as the final revision. No further check-out or check-in is possible. This cannot be undone.
              </Text>
              <Field
                label="Reason (required)"
                validationMessage={reason.length > 0 && reason.trim().length < 10 ? "Minimum 10 characters" : undefined}
                validationState={reason.length > 0 && reason.trim().length < 10 ? "error" : "none"}
                required
              >
                <Textarea
                  placeholder="Why is this the final revision? (min 10 chars)"
                  value={reason}
                  onChange={(_, d) => setReason(d.value)}
                  rows={3}
                />
              </Field>
              {mutation.isError && (
                <Text className={styles.error} size={200}>{mutation.error?.message ?? "Finalize failed. Try again."}</Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
              <Button appearance="primary" disabled={reason.trim().length < 10 || mutation.isPending} onClick={handleConfirm}>
                {mutation.isPending ? <Spinner size="tiny" /> : "Confirm Finalize"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: `MarkVoidDialog.tsx` (reason required ≥10, danger styling)**

Copy `ForceCheckInDialog.tsx` and adapt: import `useMarkVoid`, trigger label "Mark Void", title "Void drawing", body warning "Voiding cancels this drawing and all its sheets. This is terminal and cannot be undone.", confirm label "Confirm Void", `mutation.mutate({ drawingId, reason }, ...)`. Keep the same red `warningStripe` + danger confirm button styling and the ≥10-char guard.

```tsx
import { useState } from "react";
import {
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogContent, DialogActions,
  Button, Field, Textarea, Text, Spinner, tokens, makeStyles,
} from "@fluentui/react-components";
import { Warning24Regular } from "@fluentui/react-icons";
import { useMarkVoid } from "../hooks/useMarkVoid";

const useStyles = makeStyles({
  warningStripe: {
    display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorPaletteRedBackground2, borderRadius: tokens.borderRadiusMedium,
    marginBottom: tokens.spacingVerticalM, color: tokens.colorPaletteRedForeground1,
  },
  error: { color: tokens.colorPaletteRedForeground1, display: "block", marginTop: tokens.spacingVerticalXS },
});

interface Props { drawingId: string; }

export function MarkVoidDialog({ drawingId }: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useMarkVoid();

  function handleOpen() { setReason(""); mutation.reset(); setOpen(true); }
  function handleConfirm() {
    if (reason.trim().length < 10) return;
    mutation.mutate({ drawingId, reason: reason.trim() }, { onSuccess: () => setOpen(false) });
  }

  return (
    <>
      <Button
        appearance="outline"
        style={{ color: tokens.colorPaletteRedForeground1, borderColor: tokens.colorPaletteRedForeground1 }}
        onClick={handleOpen}
      >
        Mark Void
      </Button>
      <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) setOpen(false); }}>
        <DialogSurface>
          <DialogTitle>Void drawing</DialogTitle>
          <DialogBody>
            <DialogContent>
              <div className={styles.warningStripe}>
                <Warning24Regular />
                <Text weight="semibold">Voiding cancels this drawing and all its sheets. Terminal — cannot be undone.</Text>
              </div>
              <Field
                label="Reason (required)"
                validationMessage={reason.length > 0 && reason.trim().length < 10 ? "Minimum 10 characters" : undefined}
                validationState={reason.length > 0 && reason.trim().length < 10 ? "error" : "none"}
                required
              >
                <Textarea
                  placeholder="Why is this drawing being cancelled? (min 10 chars)"
                  value={reason}
                  onChange={(_, d) => setReason(d.value)}
                  rows={3}
                />
              </Field>
              {mutation.isError && (
                <Text className={styles.error} size={200}>{mutation.error?.message ?? "Void failed. Try again."}</Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
              <Button
                appearance="primary"
                style={{ backgroundColor: tokens.colorPaletteRedBackground3, color: tokens.colorNeutralForegroundOnBrand }}
                disabled={reason.trim().length < 10 || mutation.isPending}
                onClick={handleConfirm}
              >
                {mutation.isPending ? <Spinner size="tiny" /> : "Confirm Void"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: `MarkObsoleteDialog.tsx` (confirm-only, reason optional)**

```tsx
import { useState } from "react";
import {
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogContent, DialogActions,
  Button, Field, Textarea, Text, Spinner, tokens, makeStyles,
} from "@fluentui/react-components";
import { useMarkObsolete } from "../hooks/useMarkObsolete";

const useStyles = makeStyles({
  intro: { marginBottom: tokens.spacingVerticalM, color: tokens.colorNeutralForeground2 },
  error: { color: tokens.colorPaletteRedForeground1, display: "block", marginTop: tokens.spacingVerticalXS },
});

interface Props { drawingId: string; }

export function MarkObsoleteDialog({ drawingId }: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mutation = useMarkObsolete();

  function handleOpen() { setReason(""); mutation.reset(); setOpen(true); }
  function handleConfirm() {
    mutation.mutate({ drawingId, reason: reason.trim() || undefined }, { onSuccess: () => setOpen(false) });
  }

  return (
    <>
      <Button appearance="outline" onClick={handleOpen}>Mark Obsolete</Button>
      <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) setOpen(false); }}>
        <DialogSurface>
          <DialogTitle>Mark drawing obsolete</DialogTitle>
          <DialogBody>
            <DialogContent>
              <Text className={styles.intro}>
                Marking obsolete flags this drawing and its sheets as "do not use". This is terminal and cannot be undone.
              </Text>
              <Field label="Reason (optional)">
                <Textarea
                  placeholder="Optional note explaining why this is obsolete"
                  value={reason}
                  onChange={(_, d) => setReason(d.value)}
                  rows={3}
                />
              </Field>
              {mutation.isError && (
                <Text className={styles.error} size={200}>{mutation.error?.message ?? "Mark obsolete failed. Try again."}</Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
              <Button appearance="primary" disabled={mutation.isPending} onClick={handleConfirm}>
                {mutation.isPending ? <Spinner size="tiny" /> : "Confirm Obsolete"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/code-app && npx tsc --noEmit
```

Expected: no NEW errors in the three new files. (Pre-existing errors in `SubmitRevisionDrawer.tsx` / `ForceCheckInDialog.tsx` still present — fixed in Task 12.)

- [ ] **Step 5: Commit**

```bash
git add apps/code-app/src/features/checkout/components/FinalizeDialog.tsx apps/code-app/src/features/checkout/components/MarkVoidDialog.tsx apps/code-app/src/features/checkout/components/MarkObsoleteDialog.tsx
git commit -m "feat(plan-12): add Finalize, MarkVoid, MarkObsolete dialogs"
```

---

## Task 12: Code App — wire dialogs into the panel; update ForceCheckIn + state labels

**Files:**
- Modify: `apps/code-app/src/features/checkout/components/ForceCheckInDialog.tsx`
- Modify: `apps/code-app/src/features/checkout/components/SubmitRevisionDrawer.tsx`
- Modify: `apps/code-app/src/features/checkout/components/DrawingActionsPanel.tsx`
- Modify: `apps/code-app/src/features/checkout/components/ReservationDrawingsPanel.tsx`
- Test: `apps/code-app/src/__tests__/checkout/DrawingActionsPanel.test.tsx`

- [ ] **Step 1: ForceCheckInDialog — add required revision number field**

`ForceCheckInDialog` now needs `drawingId` + `currentRevision` props and a revision input. Update its `Props` and add the field. Replace the `Props` interface and the start of the component:

```tsx
interface Props {
  checkoutId: string;
  drawingId: string;
  currentRevision?: string;
}

export function ForceCheckInDialog({ checkoutId, drawingId, currentRevision }: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [newRevision, setNewRevision] = useState("");
  const mutation = useForceCheckin();

  function handleOpen() {
    setReason("");
    setNewRevision(nextRevision(currentRevision));
    mutation.reset();
    setOpen(true);
  }

  function handleConfirm() {
    if (reason.length < 10 || !newRevision.trim()) return;
    mutation.mutate(
      { checkoutId, drawingId, newRevision: newRevision.trim(), reason },
      { onSuccess: () => setOpen(false) },
    );
  }
```

Add the import `import { nextRevision } from "../api/checkoutClient";` and add an `Input` + `Field` import from `@fluentui/react-components`. Add a revision field directly above the existing reason `Field`:

```tsx
              <Field label="Final revision number (required)" required>
                <Input
                  value={newRevision}
                  onChange={(_, d) => setNewRevision(d.value)}
                  placeholder="e.g. C or 03"
                  aria-label="Final revision number"
                />
              </Field>
```

Update the confirm button's `disabled` to also require a revision:
```tsx
                disabled={reason.length < 10 || !newRevision.trim() || mutation.isPending}
```

- [ ] **Step 2: SubmitRevisionDrawer — always use the plugin (drop useCheckIn branch)**

`SubmitRevisionDrawer` currently picks between `useSubmitRevision` and `useCheckIn` on `RequireCheckInApproval`. The plugin now owns that branch. Simplify: always `const mutation = useSubmitRevision();`. Keep the `RequireCheckInApproval` read ONLY for button label text. Remove `import { useCheckIn } ...`. Update `handleSubmit` to pass the reason through (optional):

```tsx
  const { RequireCheckInApproval } = useAppConfig();
  const mutation = useSubmitRevision();
  // ...
  function handleSubmit() {
    if (!newRevision.trim() || !filesConfirmed) return;
    mutation.mutate(
      { checkoutId, drawingId, newRevision: newRevision.trim() },
      { onSuccess: () => setOpen(false) },
    );
  }
```

Keep the existing label conditionals (`RequireCheckInApproval ? "Submit Revision" : "Check In"` etc.) unchanged — the test suite asserts on those exact strings.

- [ ] **Step 3: DrawingActionsPanel — new action matrix + Finalized state**

Update the `STATE_LABELS` / `STATE_BADGE_COLOR` maps: replace the whole pair by re-using the shared maps from `checkoutClient`. Replace the local maps with imports:

```tsx
import { DrawingState, DRAWING_STATE_LABELS, DRAWING_STATE_BADGE_COLOR } from "../api/checkoutClient";
```

and in `ReadOnlyStateLabel`:
```tsx
  const label = DRAWING_STATE_LABELS[drawing.state] ?? "Unknown";
  const color = DRAWING_STATE_BADGE_COLOR[drawing.state] ?? "subtle";
```

Add imports for the new dialogs:
```tsx
import { FinalizeDialog } from "./FinalizeDialog";
import { MarkObsoleteDialog } from "./MarkObsoleteDialog";
import { MarkVoidDialog } from "./MarkVoidDialog";
```

Replace the component body's action logic with the spec §6.2 matrix:

```tsx
export function DrawingActionsPanel({ drawing, openCheckout, adminMode }: Props) {
  const styles = useStyles();
  const { role } = useUserRole();
  const { data: currentUser } = useCurrentUser();
  const isAdmin    = role === "Admin";
  const isApprover = role === "Approver";

  // Terminal states: read-only badge, no actions
  if (drawing.state === DrawingState.Finalized ||
      drawing.state === DrawingState.Obsolete ||
      drawing.state === DrawingState.Void) {
    return <ReadOnlyStateLabel drawing={drawing} openCheckout={openCheckout} />;
  }

  // Available: Check Out + Finalize for everyone; admins also get Obsolete/Void
  if (drawing.state === DrawingState.Available) {
    return (
      <div className={styles.actionRow}>
        <CheckOutButton drawingId={drawing.id} />
        <FinalizeDialog drawingId={drawing.id} />
        {isAdmin && <MarkObsoleteDialog drawingId={drawing.id} />}
        {isAdmin && <MarkVoidDialog drawingId={drawing.id} />}
      </div>
    );
  }

  // CheckedOut, own checkout: submit revision
  if (drawing.state === DrawingState.CheckedOut &&
      openCheckout && openCheckout.checkedOutBy === currentUser?.id) {
    return (
      <SubmitRevisionDrawer
        checkoutId={openCheckout.id}
        drawingId={drawing.id}
        currentRevision={drawing.currentRevision}
        spLibraryUrl={drawing.spLibraryUrl}
      />
    );
  }

  // CheckedOut, someone else's checkout: admin/approver get Force Check In + Mark Void
  if (drawing.state === DrawingState.CheckedOut && openCheckout && (isAdmin || isApprover)) {
    return (
      <div className={styles.actionRow}>
        <ForceCheckInDialog
          checkoutId={openCheckout.id}
          drawingId={drawing.id}
          currentRevision={drawing.currentRevision}
        />
        {isAdmin && <MarkVoidDialog drawingId={drawing.id} />}
      </div>
    );
  }

  // AwaitingValidation: approver/admin review
  if (drawing.state === DrawingState.AwaitingValidation && openCheckout && (isApprover || isAdmin)) {
    return <ValidationDrawer checkout={openCheckout} drawing={drawing} />;
  }

  return <ReadOnlyStateLabel drawing={drawing} openCheckout={openCheckout} />;
}
```

Add an `actionRow` style to the existing `useStyles`:
```tsx
  actionRow: { display: "flex", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
```

> `adminMode` is no longer needed to branch force-checkin (role drives it now); leave the prop in `Props` for call-site compatibility but it is unused. If `tsc` flags the unused param, prefix with `_adminMode` or drop it from the destructure (it stays in the interface).

- [ ] **Step 4: ReservationDrawingsPanel — fix state label/color maps**

`ReservationDrawingsPanel` has its own local `STATE_LABEL` / `STATE_COLOR` that reference `DrawingState.CheckedIn` (now removed) and lack `Finalized`. Replace both local maps with the shared imports:

```tsx
import { DrawingState, DRAWING_STATE_LABELS, DRAWING_STATE_BADGE_COLOR } from "../api/checkoutClient";
```

and in the `state` column `renderCell`:
```tsx
        <Badge appearance="filled" color={DRAWING_STATE_BADGE_COLOR[drawing.state] ?? "subtle"} shape="rounded">
          {DRAWING_STATE_LABELS[drawing.state] ?? "Unknown"}
        </Badge>
```

Delete the now-unused local `STATE_LABEL`, `STATE_COLOR`, and the local `BadgeColor` type (import `BadgeColor` from checkoutClient if still referenced by `STATUS_BADGE`; that reservation `STATUS_BADGE` map is unrelated and stays).

- [ ] **Step 5: Update + run the panel test**

In `DrawingActionsPanel.test.tsx`: the `useCheckIn` mock (lines ~72-81) references a deleted module — remove that `vi.mock("../../features/checkout/hooks/useCheckIn", ...)` block and the `mockCheckInMutate` hoisted fn + its `mockClear()`. Add mocks for the three new hooks so the dialogs render without hitting the network:

```ts
const mockFinalizeMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useFinalizeDrawing", () => ({
  useFinalizeDrawing: () => ({ mutate: mockFinalizeMutate, isPending: false, isError: false, error: null, reset: vi.fn() }),
}));
const mockObsoleteMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useMarkObsolete", () => ({
  useMarkObsolete: () => ({ mutate: mockObsoleteMutate, isPending: false, isError: false, error: null, reset: vi.fn() }),
}));
const mockVoidMutate = vi.hoisted(() => vi.fn());
vi.mock("../../features/checkout/hooks/useMarkVoid", () => ({
  useMarkVoid: () => ({ mutate: mockVoidMutate, isPending: false, isError: false, error: null, reset: vi.fn() }),
}));
```

Add new behaviour tests:

```ts
test("Finalize button visible when drawing is Available", () => {
  renderWithProviders(<DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} />);
  expect(screen.getByRole("button", { name: /finalize/i })).toBeInTheDocument();
});

test("Admin sees Mark Obsolete and Mark Void on an Available drawing", () => {
  mockRole.value = "Admin";
  renderWithProviders(<DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} />);
  expect(screen.getByRole("button", { name: /mark obsolete/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /mark void/i })).toBeInTheDocument();
});

test("Non-admin does NOT see Mark Obsolete / Mark Void on an Available drawing", () => {
  mockRole.value = "User";
  renderWithProviders(<DrawingActionsPanel drawing={makeDrawing(DrawingState.Available)} />);
  expect(screen.queryByRole("button", { name: /mark obsolete/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /mark void/i })).not.toBeInTheDocument();
});

test("Finalized drawing is read-only with no action buttons", () => {
  mockRole.value = "Admin";
  renderWithProviders(<DrawingActionsPanel drawing={makeDrawing(DrawingState.Finalized)} />);
  expect(screen.getByText("Finalized")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /check out/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /finalize/i })).not.toBeInTheDocument();
});
```

> Existing Test 9 ("ForceCheckInDialog trigger visible to Admin … CheckedOut by another user") still holds. The old admin force-checkin path required `adminMode`; the new matrix shows it to admin/approver whenever the checkout belongs to someone else. The test passes a checkout owned by `OTHER_USER_ID`, so it still resolves to the Force Check-In branch — no change needed. If any existing test relied on the removed `adminMode`-only gating, update it to the role-based matrix.

Run:
```bash
cd apps/code-app && npm test -- --run src/__tests__/checkout/DrawingActionsPanel.test.tsx
```
Expected: all panel tests PASS.

- [ ] **Step 6: Full typecheck + full Code App test suite**

```bash
cd apps/code-app && npx tsc --noEmit && npm test -- --run
```

Expected: tsc clean; all Vitest suites green.

- [ ] **Step 7: Commit**

```bash
git add apps/code-app/src/features/checkout/components/ apps/code-app/src/__tests__/checkout/DrawingActionsPanel.test.tsx
git commit -m "feat(plan-12): wire finalize/obsolete/void into panel; ForceCheckIn revision field; shared state maps"
```

---

## Task 13: Integration tests — fixture helpers + live lifecycle + concurrent finalize

**Files:**
- Modify: `solution/plugins/IssueNumbers.Tests/CheckoutIntegrationTests.cs`

These run against the live dev tenant (gated by env vars; `dotnet test --filter "Category=Integration"`). They cannot run until the Custom APIs are registered (Task 14) — write them now, they will SKIP locally without env vars and run in CI / after registration.

- [ ] **Step 1: Add fixture helpers**

In the `partial class DataverseFixture` section of `CheckoutIntegrationTests.cs`, add action-name constants near the existing ones:
```csharp
        private const string SubmitRevisionAction = "enmax_acdnSubmitRevision";
        private const string FinalizeAction       = "enmax_acdnFinalizeDrawing";
        private const string MarkObsoleteAction   = "enmax_acdnMarkObsolete";
        private const string MarkVoidAction        = "enmax_acdnMarkVoid";
```

Add invoker helpers:
```csharp
        /// <summary>Invokes enmax_acdnSubmitRevision (bound to checkout).</summary>
        public async Task InvokeSubmitRevisionAsync(Guid checkoutId, string newRevision, string reason = "")
        {
            EnsureReady();
            var request = new OrganizationRequest(SubmitRevisionAction);
            request.Parameters["Target"]      = new EntityReference(CheckoutEntity, checkoutId);
            request.Parameters["NewRevision"] = newRevision;
            request.Parameters["Reason"]      = reason ?? string.Empty;
            await _client.ExecuteAsync(request).ConfigureAwait(false);
        }

        /// <summary>Invokes enmax_acdnFinalizeDrawing (bound to drawing). Returns (success, error).</summary>
        public async Task<(bool Success, string Error)> InvokeFinalizeAsync(Guid drawingId, string reason)
        {
            EnsureReady();
            try
            {
                var request = new OrganizationRequest(FinalizeAction);
                request.Parameters["Target"] = new EntityReference(DrawingEntity, drawingId);
                request.Parameters["Reason"] = reason;
                await _client.ExecuteAsync(request).ConfigureAwait(false);
                return (true, null);
            }
            catch (Exception ex) { return (false, ex.Message); }
        }

        /// <summary>Counts sheets in a given sheet-state for a drawing.</summary>
        public int CountSheetsInState(Guid drawingId, int sheetState)
        {
            EnsureReady();
            var q = new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") };
            q.Criteria.AddCondition("enmax_acdndrawing", ConditionOperator.Equal, drawingId);
            return _client.RetrieveMultiple(q).Entities
                .Count(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate")?.Value == sheetState);
        }
```

> The old `PatchCheckoutToAwaitingValidationAsync` helper simulated the pre-plugin client PATCH. Leave it in place for any test that still uses it, but the happy-path test below switches to the real `InvokeSubmitRevisionAsync`.

- [ ] **Step 2: Add live lifecycle + concurrency tests**

Append to the `CheckoutIntegrationTests` class:

```csharp
        // INT-06: Full happy path via SubmitRevision (approval OFF) then Finalize
        [Fact]
        [Trait("Category", "Integration")]
        public async Task SubmitRevision_then_Finalize_locks_drawing_and_sheets()
        {
            SkipIfNoDataverse();

            var drawingId   = await _fx.CreateAvailableDrawingAsync(revision: "A");
            Guid checkoutId = Guid.Empty;
            try
            {
                var co = await _fx.InvokeCheckOutAsync(drawingId);
                co.Success.Should().BeTrue();
                Guid.TryParse(co.CheckoutId, out checkoutId).Should().BeTrue();

                // Submit revision B (assumes RequireCheckInApproval=false in dev)
                await _fx.InvokeSubmitRevisionAsync(checkoutId, "B");

                var afterSubmit = await _fx.GetDrawingSnapshotAsync(drawingId);
                afterSubmit.State.Should().Be(1, "approval-off submit returns the drawing to Available");
                afterSubmit.CurrentRevision.Should().Be("B");

                // Finalize
                var fin = await _fx.InvokeFinalizeAsync(drawingId, "Final issued-for-construction revision.");
                fin.Success.Should().BeTrue();

                var afterFinal = await _fx.GetDrawingSnapshotAsync(drawingId);
                afterFinal.State.Should().Be(7, "finalized is terminal");
                _fx.CountSheetsInState(drawingId, 7).Should().BeGreaterThan(0,
                    "sheets must mirror the drawing into Finalized = 7");

                // Re-checkout must now fail
                var co2 = await _fx.InvokeCheckOutAsync(drawingId);
                co2.Success.Should().BeFalse("a finalized drawing cannot be checked out");
            }
            finally
            {
                if (checkoutId != Guid.Empty) await _fx.DeleteCheckoutAsync(checkoutId);
                await _fx.DeleteDrawingAsync(drawingId);
            }
        }

        // INT-07: Concurrent finalize — exactly one winner (Rule 14)
        [Fact]
        [Trait("Category", "Integration")]
        public async Task Concurrent_finalize_on_same_drawing_produces_exactly_one_winner()
        {
            SkipIfNoDataverse();
            const int ParallelCallers = 8;

            var drawingId = await _fx.CreateAvailableDrawingAsync(revision: "A");
            try
            {
                var tasks = Enumerable.Range(0, ParallelCallers)
                    .Select(_ => _fx.InvokeFinalizeAsync(drawingId, "Concurrent finalize attempt — only one may win."))
                    .ToList();
                var results = await Task.WhenAll(tasks);

                results.Count(r => r.Success).Should().Be(1,
                    because: "RowVersion concurrency must let exactly one finalize succeed; the guard rejects the rest");
                results.Count(r => !r.Success).Should().Be(ParallelCallers - 1);

                (await _fx.GetDrawingSnapshotAsync(drawingId)).State.Should().Be(7);
            }
            finally
            {
                await _fx.DeleteDrawingAsync(drawingId);
            }
        }
```

- [ ] **Step 3: Verify they compile + skip cleanly without env vars**

```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "Category=Integration" --configuration Release
```

Expected (no `.env.dev` / env vars locally): tests SKIP with the "Requires Dataverse connection" message, build succeeds, exit 0. If env vars ARE present and the Custom APIs are NOT yet registered, INT-06/07 will fail with "action not found" — that's expected until Task 14.

- [ ] **Step 4: Commit**

```bash
git add solution/plugins/IssueNumbers.Tests/CheckoutIntegrationTests.cs
git commit -m "test(plan-12): integration coverage for SubmitRevision+Finalize and concurrent finalize"
```

---

## Task 14: Register Custom APIs + deploy + verify (manual maker-UI + pipeline)

This task is NOT TDD — it is the deploy/registration step. The plugin assembly already contains the new classes; Dataverse needs the Custom API + plugin-step registrations. Follow memory `reference_deployment_runbook` (Custom API bindingtype gotcha) and plan #06 §1 conventions.

- [ ] **Step 1: Build + push the plugin assembly**

Build the assembly and push to the dev tenant per the deployment runbook (`pac plugin push` or the project's push script). Confirm the assembly version bumped.

- [ ] **Step 2: Register the four new Custom APIs (maker UI / pac)**

| Custom API (Unique Name) | Bound entity | Required inputs | Outputs |
|---|---|---|---|
| `enmax_acdnSubmitRevision` | `enmax_autocadcheckout` | `NewRevision` (String), `Reason` (String, optional) | `NewStatus` (Int), `DrawingState` (Int) |
| `enmax_acdnFinalizeDrawing` | `enmax_autocaddrawing` | `Reason` (String) | (none) |
| `enmax_acdnMarkObsolete` | `enmax_autocaddrawing` | `Reason` (String, optional) | (none) |
| `enmax_acdnMarkVoid` | `enmax_autocaddrawing` | `Reason` (String) | (none) |

For each: set the plugin type to the matching `Enmax.AutoCAD.<PluginName>`, Is Function = No, Allowed Custom Processing Step Type = synchronous. **Re-check the bindingtype gotcha from the runbook** (Entity vs Global mismatch silently breaks the `Target` parameter). Export + unpack the solution and commit the customizations XML so the registration is source-controlled.

- [ ] **Step 3: Patch option-set labels in dev**

```bash
python solution/scripts/patch_optionsets.py
```
Expected: `OK enmax_acdn_drawingstate[7] -> 'Finalized'`, `OK enmax_acdn_sheetstate[...]` (all 8), `OK enmax_acdn_auditevent[9] -> 'Finalized'`, then `OK Published.`, exit 0.

- [ ] **Step 4: Smoke-test the lifecycle in the dev Code App**

Per CLAUDE.md (UI changes must be exercised in a browser). Walk one drawing through: Available → Check Out (sheets → Checked Out) → Submit Revision (back to Available, revision bumped) → Finalize (terminal, sheets Finalized, no actions). As admin, on a fresh Available drawing: Mark Obsolete and Mark Void. Open the drawing audit timeline and confirm the full event history now renders (Created → State Changed × N → Finalized), each row keyed to the drawing.

- [ ] **Step 5: Run the integration suite against dev**

With `.env.dev` env vars present:
```bash
cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "Category=Integration" --configuration Release
```
Expected: INT-01..07 PASS, including the concurrent-finalize winner-takes-one assertion.

- [ ] **Step 6: Commit the registration customizations**

```bash
git add solution/src
git commit -m "feat(plan-12): register SubmitRevision/Finalize/MarkObsolete/MarkVoid Custom APIs"
```

---

## Final Verification (before PR)

- [ ] Full plugin unit suite green: `cd solution/plugins && dotnet test IssueNumbers.Tests/IssueNumbers.Tests.csproj --filter "Category!=Integration" --configuration Release`
- [ ] Full Code App suite green + typecheck: `cd apps/code-app && npx tsc --noEmit && npm test -- --run`
- [ ] Integration suite green against dev (Task 14 Step 5)
- [ ] Manual browser smoke of the full lifecycle done (Task 14 Step 4)
- [ ] Drawing audit timeline shows every transition keyed to the drawing
- [ ] Open PR `feat/008-drawing-lifecycle` → `dev`

---

## Spec Coverage Map

| Spec section | Covered by |
|---|---|
| §2.1 Drawing states (+Finalized 7) | Task 1, Task 9 |
| §2.2 Sheet states (+Finalized 7) | Task 1; mirror logic Tasks 2–8 |
| §2.3 Valid transitions | Tasks 2–8 (each plugin) |
| §2.4 Approval AppConfig switch | Task 4 (`SubmitRevisionPlugin.GetRequireCheckInApproval`) |
| §3 Audit events (subjectid=drawing) | Tasks 2,4,5,6,7,8 |
| §4.1 Concurrency contract | Tasks 4,7,8 (RowVersion); 5,6 (drawing-serialized) |
| §4.2 Sheet bulk-update pattern | Tasks 3,4,5,6,7,8 |
| §4.3 New plugins | Task 4 (SubmitRevision), 7 (Finalize), 8 (Obsolete/Void) |
| §4.4 Modified plugins | Tasks 2 (AutoCreate), 3 (CheckOut), 5 (ApproveCheckin), 6 (ForceCheckin) |
| §4.4 AuditEmitter (remove checkout handler) | **N/A on base branch** — `AuditEmitter.cs` ships in plan #07, not present in `feat/006`. If #07 has merged by execution time, add a follow-up step: delete the checkout-entity handler from `AuditEmitter.cs`, keep the reference-table CRUD handler; otherwise no action. Flag to reviewer. |
| §5 Schema changes | Task 1 |
| §6.1 State enum/labels/colors | Task 9 |
| §6.2 DrawingActionsPanel logic | Task 12 |
| §6.3 New components | Tasks 11,12 |
| §6.4 New hooks | Task 10 |
| §6.5 Audit trail timeline | Already implemented (plan #07 `useDrawingAuditTrail`); populated by Tasks 2–8. Verified in Task 14 Step 4 |
| §7 CI/CD (patch_optionsets in pipelines) | Already wired (cd-dev.yml / cd-uat.yml); Task 1 adds the values |

---

## Notes & Risks

- **Base-branch dependency:** this plan modifies the checkout plugins and the `features/checkout` Code App surface, which live on `feat/006`. Branch from there (or from `dev` once #06 merges). Do NOT branch from plain `dev` if #06 is unmerged — the files won't exist.
- **AuditEmitter overlap with plan #07:** §4.4 asks to strip the checkout handler from `AuditEmitter`. That file is a plan-#07 artifact. Handle per the coverage-map note above to avoid a merge-order landmine. Surface to the reviewer at PR time.
- **`danger` badge color:** confirm against the installed Fluent v9 `BadgeProps["color"]` union (Task 9 Step 1 note). Use `"important"` if `"danger"` is rejected.
- **AppConfig read in plugin:** `SubmitRevisionPlugin` queries `enmax_autocadappconfig` by `enmax_acdnkey`. Confirm the entity logical name matches the dev tenant (the Code App collection endpoint is `enmax_autocadappconfigs`; logical name is singular). If a seeded `RequireCheckInApproval` row is absent, the plugin defaults to `false` (approval off) — which matches the spec default.
- **Token budget (CLAUDE.md Rule 6):** this is a large plan. Execute task-by-task with a fresh subagent per task to stay within per-task budgets.

