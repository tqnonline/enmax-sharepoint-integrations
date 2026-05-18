# Phase 1 Cut-Line Spec

**Date:** 2026-05-17
**Author:** Engineering (Claude Code assist)
**Status:** Draft — awaiting review
**Source:** `PRD-and-Architecture.md` v1.5 Final (sections 2, 4, 24, 25) + `2026-05-17-open-questions-decision-memo.md`

## Purpose

The PRD enumerates ~40 functional requirements, 19 acceptance criteria, and a long deferred-items list scattered across sections. This spec freezes the Phase 1 boundary in one place so:

1. Every implementation plan can be checked against a single in/out list.
2. Any "while we're at it…" temptation during build is rejected with a documented reason.
3. Stakeholders know exactly what UAT will and will not contain.

## In Scope — Phase 1

### Capabilities

| Area | Capability | PRD ref |
|------|------------|---------|
| **Numbering** | Six cascading segment dropdowns (Business, Asset, Unit, Domain, System, Kind) with dependency constraints | F-01 |
| | Auto-generated 4-digit sequence per (BB,AA,UU,DDD,SSS,KK) combination | F-02, F-40, A19 |
| | Soft-validation override for invalid BB-AA pairs with audited reason | F-04, A5 |
| | Concurrency-safe issuance via Dataverse custom action + C# plug-in | F-02a, A2 |
| | Per-sequence seeding (single-value and bulk CSV) + YAML-at-deploy seeding | F-39, A18 |
| | Exhaustion warnings at 9000 (Warning) and 9900 (Critical); refusal at 9999 | F-40, A19 |
| **Reservation** | Reserve 1–N drawings × 1–M sheets, configurable via App Configuration | F-03 |
| | Single global admin approval queue | F-05 |
| | Three-channel approval notifications: email, Teams 1:1 adaptive card, in-app | F-06, A1, A3 |
| | Decline-with-reason path, reason delivered verbatim | F-07, A4 |
| **Check-Out / Check-In** | Dataverse-only check-out state (no SharePoint REST lock) | F-10, A7 |
| | Display checkout holder and duration in Search | F-11 |
| | Admin force-checkin with typed reason and audit | F-12, A10 |
| | Stale-checkout reminders at 3, 6, 12 months | F-13, A11 |
| | Revision submit with deterministic filename indexing and missing-sheet detection | F-14, A2b, A8 |
| | Approver validates and approves; Drawing → CheckedIn; revision bumped | F-15, A9 |
| | Three-channel notification on all approval outcomes | F-16 |
| **Search & Discovery** | Filter by six segments + free-text title + ENMAX number + vendor | F-17, A6 |
| | Result grid: SharePoint link, requester, revision date/number, full number | F-18 |
| | Column sort, keyword filter, server paging, admin-only CSV export | F-19, A17 |
| **Admin Surfaces** | Manage all reference data (Business, Asset, Unit, Domain, System, Kind, Record Type, Record Phase, Vendor, Asset-Unit, BB-AA, System Scope) | F-21 |
| | View user-to-team assignments (read-only mirror of Entra groups) | F-22 |
| | Override/release stuck records, audited | F-23 |
| | Number-sequence management UI: seed, bulk import, capacity view | F-32, A18 |
| **Notifications & Config** | In-app bell with read/unread feed, deep links, mark-all-read | F-33, A15 |
| | Broadcast messages: audience, severity, start/expiry, acknowledgement | F-34, A16 |
| | Single Admin Mode flag (read-only banner, admin-maintainable) | F-35, A12 |
| | Application footer (version, release date, disclaimer, copyright) | F-36, A17 |
| | Model-driven shell (sidebar, command bar, global search, bell, footer) | F-37, A17 |
| **Platform** | Power Apps Code App (React 18 + Fluent UI v9 + TypeScript 5) | section 15 |
| | Model-driven admin app over same Dataverse tables | section 17 |
| | Power Automate flows (16 total) with three notification channels | section 10 |
| | SharePoint Online: one site collection, one library per Asset-Unit | section 8 |
| | Entra ID SSO via Power Apps host (no app-side auth) | section 12 |
| | Service account `eec_pwrplat_svc@enmax.com` for all flow connections | section 12 |
| | Audit log on every state transition, override, config change | F-31, A13 |
| | Deterministic-GUID seed strategy across dev/UAT/prod | section 22, A14 |

### Acceptance Criteria (Phase 1 Exit)

All 19 acceptance criteria A1–A19 from PRD section 24 must pass on a freshly-imported environment. Cut-line acknowledges these are the only criteria; nothing else gates Phase 1 release.

## Out of Scope — Phase 1 (Deferred to Phase 2 or Later)

| Deferred Item | Why deferred | Where it lands |
|---------------|--------------|----------------|
| Standards, Procedures, and Forms (three-digit Procedure suffix) | Different numbering scheme, different audience, different content type. Independent feature, not a variant. | Phase 2 |
| Historical data migration from legacy SQL Server | Migration is one-off ops work, not product. Heather has 4 weeks to flag any data needed for in-flight reservations; otherwise legacy stays read-only as reference. | Separate migration project, post-Phase 1 |
| Native CAD (.dwg) file handling on the P: drive | Code App + SharePoint scope is PDF-only by design. .dwg lives on file share with its own ACL story. | Phase 2 (if ever — may stay on file share permanently) |
| Power BI dashboards (LCR Daily Report replacement) | Reporting is a separate workspace concern. Dataverse is the system of record; Power BI reads from it independently. | Phase 2 reporting workstream |
| Mobile, external access | Code Apps explicitly do not support Power Apps mobile or Power Apps for Windows (PRD section 15.3). Hard platform limitation, not a scope choice. | Not planned |
| InfoLink read integration | InfoLink is a separate system. Cross-system bridge is its own design. | Phase 2 if business case emerges |
| Automated file naming on user upload | Users name files via deterministic pattern surfaced in UI. Auto-rename on upload requires SP write permission the service account does not have. | Phase 2 if SP scope expands |
| File locking on the file share | File share is out of scope entirely. Check-out is Dataverse-state-only. | Not planned |
| Multi-language (i18n) | English only per PRD section 15.2. | Not planned |
| Power Apps mobile / Windows native | Hard platform limitation (Code Apps are browser-only). | Not planned |
| Power BI Visual embed of the app | Hard platform limitation per PRD section 15.3. | Not planned |
| SharePoint forms integration | Hard platform limitation. SP columns managed independently. | Not planned |

## Cut-Line Decision Rules

When a request arises mid-build to add scope, the answer is **no** unless ALL of these hold:

1. The request fixes a Phase 1 acceptance criterion (A1–A19) that would otherwise fail.
2. The fix is the minimum that makes the criterion pass — not a "better" version.
3. The fix does not introduce a new external dependency, new data table, or new flow.

Any other request is logged as a Phase 2 backlog item with a one-line rationale and parked. The build window has no slack for scope drift.

## Effort Baseline (re-baselined 2026-05-18 post architecture review)

Phase 1 effort estimate (sum of plan-level estimates):

| Plan | Estimate |
|------|----------|
| #01 Repo scaffold | 4–6h |
| #02 Dataverse schema + seed (incl. retroactive amendments) | 10–14h |
| #03 IssueNumbers plug-in | 12–16h |
| #04 Code App shell | 10–14h |
| #05 Reservation flow + 3-channel notifications | 16–20h |
| #06 Check-out / Check-in + SP provisioning | 18–22h |
| #07 Search + admin surfaces (incl. C# audit plug-in addition) | 26–30h |
| #08 Broadcasts + notification feed + Home | 14–18h |
| #09 UAT promotion + acceptance pass | 8–12h |
| **Total Phase 1** | **118–152h** |

Calendar at 20 hours/day sustained execution = **6–8 working days**. PRD's prior "24-hour build window" reference is rebased here. UAT cutover window separately remains ~24 hours within plan #09 timeframe.

Plan #10 (F-06 release-numbers) is Phase 1.5 — ships after UAT acceptance, ~6–8h additional effort.

## Phase 1 Non-Goals (Explicit)

These look like they could fit Phase 1 but are deliberately excluded:

- **No retroactive audit-log backfill.** Audit log begins at first deploy; legacy state transitions are not reconstructed.
- **No SLA monitoring or alerting.** Synthetic monitor flow on `Sites.Selected` is the only health check (PRD risk #2 mitigation). No Application Insights, no dashboard.
- **No bulk drawing edit.** Each drawing edited individually via grid. Bulk operations are Phase 2.
- **No drawing-level permission overrides.** Row-level access follows Entra group → Dataverse team → role (PRD section 12). No per-drawing ACL.
- **No version-pinning of SharePoint document links.** Latest major version always linked. No "view as-of date X" feature.
- **No undo / soft-delete of state transitions.** Audit log records the history. Reversal is a new transition (Drawing → Available from Obsolete, audited), not an undo button.

## Phase 1 Exit Criteria

Phase 1 is complete when:

1. A clean import of the solution package into a freshly-provisioned tenant produces an environment that passes all 19 acceptance criteria.
2. All 10 runbooks (PRD section 21) are written, executed at least once by the IT Admin in a test tenant, and verified end-to-end.
3. Concurrency test (50+ parallel calls to `enmax_acdnIssueNumbers`) returns zero duplicates and zero gaps across at least 10 consecutive runs.
4. Accessibility audit (`axe-core/playwright`) returns zero violations on every page.
5. Service account credentials are stored in Azure Key Vault, rotated once, and a deploy succeeds against the rotated credential.
6. UAT smoke pass executed by Heather and signed off in writing.

## Locked Decisions (from Decision Memo)

| Topic | Locked answer |
|-------|---------------|
| Connection-ref / env-var prefixes | Separate: `enmax_connref_*` and `enmax_envar_*` |
| Teams adaptive card delivery | 1:1 to personal chat (approved) |
| `Sites.Selected` scope | Generation Drawings site only |
| Dataverse region | Canada Central (`DATAVERSE_GEO=can`) |
| Outbound email sender | `noreply-autocad@enmax.com` (prod/UAT), `noreply-autocad@tqnonline.onmicrosoft.com` (dev). Service account granted `Send As`. No-reply pattern — email copy must not invite replies. |
| Power Apps licensing | Per-user Premium for all (admins, approvers, end users, search-only) |
| `Enable code apps` toggle | ON in both dev and UAT (confirmed) |

## Open Items Tracked Outside This Spec

- **Q2 verification:** PRD assumes Teams 1:1 bot is approved. Locked answer says approved. IT to confirm at runbook #008 execution. If wrong at that gate, fallback to private-channel adaptive cards is a one-action change in three flows.
- **Q6 cost confirmation:** Procurement to confirm per-user Premium pricing under ENMAX Enterprise Agreement before UAT. Cost over-run is not a launch blocker but is a project-status escalation.
- **`Send As` grants:** Exchange admin must grant `Send As` on both `noreply-autocad@enmax.com` and `noreply-autocad@tqnonline.onmicrosoft.com` to the respective service accounts before email flows can send. Add to runbook #001.

## Next Step

Plan #01 — repo scaffold. Implementation plan to follow this spec.
