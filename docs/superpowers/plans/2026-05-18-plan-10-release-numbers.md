# Plan #10 — F-06 Release Unused Reserved Numbers (Phase 1.5)

**Date:** 2026-05-18
**Owner:** Engineering (Claude Code agent + one human reviewer: Rahul Akmol)
**Spec:** `2026-05-17-phase-1-cut-line-spec.md` + `2026-05-18-architecture-review.md` Finding 5.2
**PRD refs:** F-06, section 5 (journeys), section 7.2 (Drawing states), section 12.4 (privilege matrix), section 27 (glossary)
**Decisions:** project decision 2026-05-18 — implement F-06 as Phase 1.5 dedicated plan (not in Phase 1; not deferred to Phase 2)
**Estimated effort:** 6–8 hours
**Branch:** `feat/010-release-numbers` → PR to `dev`
**Phase:** Phase 1.5 — ships AFTER Phase 1 UAT acceptance (plan #09 sign-off)
**Blocked by:**
- All Phase 1 plans #01–#09 merged AND UAT-accepted
- Heather sign-off complete

## Context

PRD F-06 grants the user (or admin) the right to release unused reserved numbers. "Released numbers move to a Cancelled state; the sequence is not reused" — burned forever. Phase 1 has no F-06 implementation; architecture review (Finding 5.2) identified the orphan; project decision 2026-05-18 chose Phase 1.5 dedicated plan over Phase 2 deferral or in-line addition to plan #07.

After this plan merges, an end user can mark their own approved-but-unused Drawings as Void; an admin can do the same for any Drawing. The sequence value remains burned (PRD F-39: "the sequence is not reused"). Audit captures every release with required typed reason.

This plan does **not** revisit sequence reuse semantics (PRD F-39 is binding) and does **not** add a "re-issue burned numbers" admin override (would require plug-in surgery and contradicts the deterministic numbering invariant).

## Prerequisites

- Phase 1 complete + UAT-accepted (plan #09 sign-off)
- Drawing rows exist in `Available` state from real reservation activity
- Audit log machinery operational (`AuditEmitter` plug-in from plan #07 Step 4b live)
- App Configuration has new key `ReleaseRequiresReason` (default `true`) — added by this plan

## Out of Scope for This Plan

- Sequence reuse (PRD F-39 prohibits)
- Batch release across multiple Reservations (single-Reservation batch supported; cross-Reservation deferred to Phase 2)
- Re-issue / un-void affordance (Phase 2 if business case emerges)
- Admin-initiated release of Drawings under another user's Reservation (admin has override per F-06; see Step 3)

## Step 1 — `enmax_acdnReleaseDrawing` Custom Action

Bound to `enmax_autocaddrawing`. Authored in maker; export+unpack+commit per plan #02 discipline.

| Property | Value |
|----------|-------|
| Binding | Entity (`enmax_autocaddrawing`) |
| Is function | No |
| Inputs | `Reason` (String, max 2000, required when `ReleaseRequiresReason=true`) |
| Outputs | `DrawingId`, `NewState`, `SequenceKeyBurned` |

**Implementation:** flow triggered by action message. Steps:

1. Read `AppConfig.ReleaseRequiresReason`; if true and Reason empty → throw "Reason required (min 10 chars)"
2. Guard: if `Drawing.State != Available` → throw "Drawing must be Available to release; current state is {{state}}"
3. Guard: caller must be Drawing.Owner OR Admin role member; otherwise throw "Permission denied"
4. Update Drawing: `State = Void` (6 per plan #02 option set)
5. Update all child Sheets: `State = Void` (6)
6. Audit Event: written by `AuditEmitter` plug-in on Drawing.State Update (automatic per plan #07 Step 4b registration)
7. Notify Owner Reservation owner (if different from caller — admin force-release path) across 3 channels
8. Return `SequenceKeyBurned` = composed `BB-AA-UU-DDD-SSS-KK-nnnn` of released drawing

## Step 2 — Code App UI

**File tree:**

```
src/features/release/
├── components/
│   ├── ReleaseDrawingButton.tsx       # Single-Drawing release from side panel
│   ├── ReleaseReasonDialog.tsx        # Captures Reason; min 10 chars; admin "release on behalf of" toggle
│   └── ReleaseBatchPanel.tsx          # Multi-select in My Reservations row panel
└── hooks/
    └── useReleaseDrawing.ts           # React Query mutation wrapping enmax_acdnReleaseDrawing
```

**ReleaseDrawingButton placement:**

- **End user view:** Drawing side panel (from plan #07 Search + plan #06 DrawingActionsPanel) — visible when Drawing.State=Available AND Drawing.Owner=currentUser
- **Admin view:** same panel — visible when Drawing.State=Available regardless of owner; dialog shows "Release on behalf of {{owner.displayName}}" warning

**Multi-release from My Reservations:**
- New row action on `My Reservations` grid (plan #07 Step 3): "Release unused drawings"
- Opens panel showing all Available Drawings tied to the Reservation
- Multi-select; admin can include Drawings owned by anyone (single-Reservation scope)
- "Release N drawings" button → sequential calls to `enmax_acdnReleaseDrawing` (mirror plan #05 bulk approve pattern — linear audit)

## Step 3 — Admin Force-Release Audit

Admin force-release (releasing another user's Drawing) writes:
- Audit Event with `Event=OverrideUsed`, Source=Action, ActedBy=admin, ActedOnBehalfOf=originalOwner
- Reason column includes admin-provided text + system-appended note "Force-released; originally owned by {{owner.displayName}}"
- Notify original owner via 3 channels (email + Teams + in-app)

End-user self-release (releasing own Drawing) writes:
- Audit Event with `Event=StateChanged`, From=Available, To=Void, ActedBy=user
- No on-behalf-of attribution
- No external notification (user acts on own data; no one else needs to know)

## Step 4 — App Configuration Addition

| Key | Value Type | Default | Description |
|-----|-----------|---------|-------------|
| `ReleaseRequiresReason` | Boolean | `true` | When true, `enmax_acdnReleaseDrawing` requires non-empty Reason input; admin can flip to false via Settings for ad-hoc bulk cleanups (audited). |

Add to plan #02 retroactively per same pattern as `MissingSheets` etc., OR add to a future plan #02 amendment session — this plan documents the requirement, schema addition happens in maker w/ export+unpack+commit.

## Step 5 — Tests

**Code App component tests (~6):**

| # | Test | Asserts |
|---|------|---------|
| 1 | ReleaseDrawingButton visible only when Drawing.State=Available | |
| 2 | ReleaseDrawingButton hidden for non-owner non-admin | |
| 3 | ReleaseDrawingButton visible for admin on any Available Drawing | |
| 4 | ReleaseReasonDialog requires reason min 10 chars when ReleaseRequiresReason=true | |
| 5 | Admin force-release dialog shows "on behalf of" warning | |
| 6 | Multi-release calls action sequentially per Drawing | |

**Integration tests (~4):**

| # | Test | Asserts |
|---|------|---------|
| 7 | User releases own Drawing → State=Void, Sheets all Void, audit StateChanged | |
| 8 | User cannot release another user's Drawing → 403 | Permission boundary |
| 9 | Admin releases another user's Drawing → State=Void, audit OverrideUsed w/ on-behalf-of | |
| 10 | Released Drawing cannot be checked out (state guard from plan #06 Step 1.1 holds) | |

## Verification — End-to-End Checklist

```powershell
Set-Location apps/code-app
npm test -- src/features/release
npx playwright test src/features/release

npm run build
npx power-apps push --environmentId $env:DEV_POWER_APPS_ENV_ID

Set-Location ../..
python solution/scripts/pack.py
python solution/scripts/import.py     # imports enmax_acdnReleaseDrawing + flow + AppConfig key

# Manual smoke (User + Admin)
# 1. As User: open own Approved Drawing in side panel → Release button visible → click → enter reason → confirm
#    Expect: Drawing State=Void; Sheets all Void; audit log shows StateChanged Available->Void w/ Reason
# 2. As Admin: open another user's Approved Drawing → Release button visible w/ "on behalf of" warning → confirm
#    Expect: original owner gets 3-channel notification w/ admin's reason
# 3. As User: try to check out a Void Drawing → expect "Drawing must be Available" error (plan #06 guard)
```

**Acceptance:**
- 10 tests pass
- Manual smoke passes for User + Admin paths
- Audit log captures both transition + on-behalf-of attribution
- Sequence value remains burned (Number Sequence.LastIssued unchanged)
- PR reviewed by Rahul, squash-merged to `dev`
- After merge, run UAT release-numbers smoke pass against UAT tenant

## Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| User accidentally releases a Drawing they actually need | Confirmation dialog requires typed Reason; min 10 chars forces deliberate action. Released Drawings stay in Audit log + Reference Data → Drawings filterable by State=Void; admin can document but NOT un-void (would violate F-39 sequence invariant). |
| Admin force-release sprees expand audit log without value | Per-action audit captures admin; if abuse pattern emerges, governance review. No technical prevention in Phase 1.5. |
| `AuditEmitter` plug-in (plan #07 Step 4b) not registered on Drawing Update yet | Plan #10 ships AFTER Phase 1 UAT — plan #07 already deployed. Verify registration list includes Drawing Update at plan #10 implementation start. |
| User confuses Void state with Obsolete state | Surface tooltips on State column: "Void: released before use; Obsolete: end-of-life for previously-active drawing". |

## TODOs Left in This Plan

- **App Config `ReleaseRequiresReason` schema add:** maker UI authoring + export-unpack-commit; tiny addition.
- **Phase 1.5 verification gate:** confirm Heather + ops accept the burned-sequence reality before plan #10 starts. F-06 explicitly notes burned values per PRD F-39; no surprises expected, but worth confirming during sign-off.
