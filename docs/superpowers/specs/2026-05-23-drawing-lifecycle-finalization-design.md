# Drawing Lifecycle & Finalization — Design Spec

**Date:** 2026-05-23  
**Status:** Approved  
**Scope:** Dataverse schema, C# plugins, Code App UI

---

## 1. Overview

Drawings follow a full lifecycle: created automatically from an approved reservation, available for multiple checkout/checkin revision cycles, and eventually finalized (terminal). Admins can also mark drawings obsolete or void. All state transitions propagate to related sheets in the same transaction. Audit events are always written against the drawing ID — never the checkout ID.

---

## 2. State Machine

### 2.1 Drawing States (`enmax_acdn_drawingstate`)

| Value | Label | Terminal | Notes |
|---|---|---|---|
| 0 | None | — | System default |
| 1 | Available | No | Ready for checkout |
| 2 | Checked Out | No | Active checkout exists |
| 3 | Awaiting Validation | No | Approval-gated path only (AppConfig controlled) |
| 4 | Checked In | **Deprecated** | Unused going forward |
| 5 | Obsolete | **Yes** | Admin-set: "do not use" |
| 6 | Void | **Yes** | Admin-set: cancelled |
| **7** | **Finalized** | **Yes** | User or admin: last revision is final |

### 2.2 Sheet States (`enmax_acdn_sheetstate`)

Mirrors drawing states 1:1. Add value **7 = Finalized**.  
Sheets are always updated in the same plugin transaction as the drawing — no independent sheet state changes.

### 2.3 Valid Transitions

```
AutoCreate          → Available(1)         [AutoCreateDrawingsPlugin; audit: Created]
Available(1)        → Checked Out(2)       [CheckOutDrawingPlugin]
Checked Out(2)      → Available(1)         [SubmitRevisionPlugin, approval=OFF; bumps revision]
Checked Out(2)      → Awaiting Val.(3)     [SubmitRevisionPlugin, approval=ON]
Checked Out(2)      → Available(1)         [ForceCheckinPlugin; bumps revision; admin only]
Awaiting Val.(3)    → Available(1)         [ApproveCheckinPlugin approved; bumps revision]
Awaiting Val.(3)    → Checked Out(2)       [ApproveCheckinPlugin declined]
Available(1)        → Finalized(7)         [FinalizeDrawingPlugin; reason required]
Any non-terminal    → Obsolete(5)          [MarkObsoletePlugin; admin only]
Any non-terminal    → Void(6)             [MarkVoidPlugin; admin only; reason required]
```

### 2.4 Approval AppConfig Switch

AppConfig key: `RequireCheckInApproval` (bool, default `false`).

- `false`: `SubmitRevisionPlugin` closes checkout immediately, drawing returns to Available.
- `true`: `SubmitRevisionPlugin` sets checkout → AwaitingValidation, drawing → AwaitingValidation; approver then calls `ApproveCheckinPlugin`.

---

## 3. Audit Events

All audit events use **drawingId** as `enmax_acdnsubjectid` and `enmax_autocaddrawing` as `enmax_acdnsubjecttable`.

| Value | Label | Emitted by |
|---|---|---|
| 1 | Created | `AutoCreateDrawingsPlugin` — once per drawing on creation |
| 2 | State Changed | All state transitions (checkout, submit, force, approve, decline, obsolete, void) |
| 3 | Approval Granted | `ApproveCheckinPlugin` (decision=Approved) |
| 4 | Approval Denied | `ApproveCheckinPlugin` (decision=Declined) |
| 6 | Force Checked In | `ForceCheckinPlugin` |
| **9** | **Finalized** | `FinalizeDrawingPlugin` |

Obsolete and Void transitions emit event=2 (State Changed) with `enmax_acdntostate` populated.

---

## 4. Plugin Architecture

### 4.1 Concurrency Contract

Every state-changing plugin follows this protocol (established in `CheckOutDrawingPlugin`):

1. `Retrieve` entity with current state column
2. Validate guard condition (state must be X), throw `InvalidPluginExecutionException` if not
3. Build `UpdateRequest` with `entity.RowVersion` and `ConcurrencyBehavior.IfRowVersionMatches`
4. Catch `ConcurrencyVersionMismatch` fault → throw `InvalidPluginExecutionException("Concurrent modification — retry")`
5. Only after the drawing update succeeds: bulk-update sheets, write audit row

Sheet bulk-updates do not use RowVersion — the drawing update serializes concurrent access.

### 4.2 Sheet Bulk-Update Pattern

Used by all plugins that propagate sheet state:

```csharp
var q = new QueryExpression("enmax_autocadsheet") {
    ColumnSet = new ColumnSet("enmax_autocadsheetid"),
};
q.Criteria.AddCondition("enmax_acdndrawing", ConditionOperator.Equal, drawingId);
foreach (var sheet in service.RetrieveMultiple(q).Entities)
    service.Update(new Entity("enmax_autocadsheet", sheet.Id) {
        ["enmax_acdnstate"] = new OptionSetValue(targetSheetState)
    });
```

### 4.3 New Plugins

#### `FinalizeDrawingPlugin` — `enmax_acdnFinalizeDrawing` (bound to drawing)

- **Guard:** drawing must be Available(1); else throw
- **Inputs:** `Target` (EntityReference), `Reason` (string, required, ≥10 chars)
- **Actions:**
  1. Retrieve drawing with RowVersion
  2. Update drawing → Finalized(7) with RowVersion concurrency
  3. Bulk-update sheets → Finalized(7)
  4. Write audit: event=9 (Finalized), subjectid=drawingId, reason, actedBy=initiatingUser
- **Output:** none

#### `SubmitRevisionPlugin` — `enmax_acdnSubmitRevision` (bound to checkout)

- **Inputs:** `Target` (checkout EntityReference), `NewRevision` (string, required), `Reason` (string, optional)
- **Actions:**
  1. Retrieve checkout with RowVersion; validate status=Open(1); get drawingRef
  2. Retrieve drawing with RowVersion; validate state=CheckedOut(2)
  3. Read AppConfig `RequireCheckInApproval`
  4. **If false (no approval):**
     - Update checkout → ClosedApproved(3) with RowVersion concurrency
     - Update drawing → Available(1), bump `enmax_acdncurrentrevision` = NewRevision with RowVersion concurrency
     - Bulk-update sheets → Available(2)
     - Write audit: event=State Changed, fromState=CheckedOut, toState=Available, subjectid=drawingId
  5. **If true (approval required):**
     - Update checkout → AwaitingValidation(2) with RowVersion concurrency
     - Update drawing → AwaitingValidation(3) with RowVersion concurrency
     - Bulk-update sheets → AwaitingValidation(4)
     - Write audit: event=State Changed, fromState=CheckedOut, toState=AwaitingValidation, subjectid=drawingId
- **Output:** `NewStatus` (int), `DrawingState` (int)

#### `MarkObsoletePlugin` — `enmax_acdnMarkObsolete` (bound to drawing)

- **Guard:** drawing must be non-terminal (not 5, 6, or 7); else throw
- **Inputs:** `Target`, `Reason` (string, optional)
- **Actions:**
  1. Retrieve drawing with RowVersion; validate non-terminal
  2. Update drawing → Obsolete(5) with RowVersion concurrency
  3. Bulk-update sheets → Obsolete(5)
  4. Write audit: event=State Changed, toState=Obsolete, subjectid=drawingId
- **Output:** none

#### `MarkVoidPlugin` — `enmax_acdnMarkVoid` (bound to drawing)

- **Guard:** drawing must be non-terminal; else throw
- **Inputs:** `Target`, `Reason` (string, required, ≥10 chars)
- **Actions:**
  1. Retrieve drawing with RowVersion; validate non-terminal
  2. Update drawing → Void(6) with RowVersion concurrency
  3. Bulk-update sheets → Void(6)
  4. Write audit: event=State Changed, toState=Void, reason, subjectid=drawingId
- **Output:** none

### 4.4 Modified Plugins

#### `CheckOutDrawingPlugin`
- **Add:** after drawing → Checked Out(2): bulk-update sheets → Checked Out(3)
- Audit already uses drawingId ✓; no change needed

#### `SubmitRevisionPlugin` (replaces direct checkout update from Code App)
- See 4.3 above — this is new but replaces an existing pattern

#### `ApproveCheckinPlugin`
- **Fix:** audit `subjectid` was `target.Id` (checkoutId) → change to `drawingRef.Id`
- **Add approved path:** bulk-update sheets → Available(2)
- **Add declined path:** bulk-update sheets → Checked Out(3)
- **Add idempotency guard:** if checkout already ClosedApproved, return success silently

#### `ForceCheckinPlugin`
- **Add input:** `NewRevision` (string, required)
- **Fix:** audit `subjectid` was `target.Id` (checkoutId) → change to `drawingRef.Id`
- **Add:** bump `enmax_acdncurrentrevision` = NewRevision on drawing
- **Add:** bulk-update sheets → Available(2)

#### `AutoCreateDrawingsPlugin`
- **Add:** after each drawing is created, write audit event=Created(1), subjectid=drawingId, actedBy=initiatingUser

#### `AuditEmitter`
- **Remove:** checkout entity handler (all checkout-triggered audit events now owned by individual plugins)
- **Keep:** reference-table CRUD handler unchanged

---

## 5. Schema Changes

### Option Sets

| File | Change |
|---|---|
| `enmax_acdn_drawingstate.xml` | Add value 7 = "Finalized" |
| `enmax_acdn_sheetstate.xml` | Add value 7 = "Finalized" |
| `enmax_acdn_auditevent.xml` | Add value 9 = "Finalized" |

### `patch_optionsets.py`

Add to `OPTIONSET_PATCHES`:
- `enmax_acdn_drawingstate`: append `(7, "Finalized")`
- `enmax_acdn_sheetstate`: append `(7, "Finalized")`
- `enmax_acdn_auditevent`: append `(9, "Finalized")`

No column additions required — all fields already exist on `enmax_autocadauditevent`.

---

## 6. Code App

### 6.1 State Enum and Labels

```ts
// checkoutClient.ts
export enum DrawingState {
  None = 0, Available = 1, CheckedOut = 2,
  AwaitingValidation = 3, Obsolete = 5, Void = 6, Finalized = 7,
}

export const DRAWING_STATE_LABELS: Record<number, string> = {
  0: "None", 1: "Available", 2: "Checked Out",
  3: "Awaiting Validation", 5: "Obsolete", 6: "Void", 7: "Finalized",
};

export const DRAWING_STATE_BADGE_COLOR: Record<number, BadgeAppearance> = {
  1: "success", 2: "warning", 3: "warning",
  5: "danger", 6: "danger", 7: "informative",
};
```

### 6.2 `DrawingActionsPanel` Logic

```
state=Available:
  owner / user   → [Check Out]  [Finalize]
  admin          → [Check Out]  [Finalize]  [Mark Obsolete]  [Mark Void]

state=CheckedOut, own checkout:
  → [Submit Revision]

state=CheckedOut, other user's checkout:
  admin/approver → [Force Check In]  [Mark Void]
  other user     → read-only badge

state=AwaitingValidation:
  approver/admin → [Approve Revision]  [Decline Revision]
  owner          → read-only "Awaiting Approval"
  other user     → read-only badge

state=Finalized | Obsolete | Void:
  all → read-only badge, no actions
```

### 6.3 New Components

| Component | Trigger | Inputs |
|---|---|---|
| `FinalizeDialog` | Finalize button | Reason (textarea, required ≥10 chars) |
| `MarkVoidDialog` | Mark Void button (admin) | Reason (textarea, required) |
| `MarkObsoleteDialog` | Mark Obsolete button (admin) | Confirm only, reason optional |
| `ForceCheckInDialog` (modified) | Force Check In button | Revision number (required) + Reason (required) |
| `SubmitRevisionDrawer` (modified) | Submit Revision button | Revision number + acknowledgement → calls `SubmitRevisionPlugin` |

### 6.4 New Hooks

All hooks invalidate `["drawing", drawingId]` and `["search-drawings"]` on success.

| Hook | Custom API |
|---|---|
| `useFinalizeDrawing()` | `enmax_acdnFinalizeDrawing` |
| `useMarkObsolete()` | `enmax_acdnMarkObsolete` |
| `useMarkVoid()` | `enmax_acdnMarkVoid` |
| `useSubmitRevision()` | `enmax_acdnSubmitRevision` |

### 6.5 Audit Trail Timeline

`useDrawingAuditTrail(drawingId)` — already implemented, query unchanged. Once all plugins write `drawingId` as `subjectid`, the full timeline populates automatically.

Display per event row:
- Event badge (label from `EVENTS` map)
- Actor name (`_enmax_acdnactedby_value@...FormattedValue`)
- From → To state (if present)
- Timestamp (formatted locale string)
- Reason (if present, shown below)

---

## 7. CI/CD

`patch_optionsets.py` runs in both `cd-dev.yml` and `cd-uat.yml` after solution import. New option set values are included — no additional pipeline changes needed.

---

## 8. Out of Scope

- Obsolete/Void UI for Admin App (model-driven app) — handled separately
- Reservation lifecycle audit (separate audit subject table)
- Bulk finalize / bulk void across multiple drawings
- Notification emails on finalization
