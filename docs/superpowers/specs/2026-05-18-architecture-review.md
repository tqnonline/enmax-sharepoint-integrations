# Architecture Review — Phase 1 Plan Series

**Date:** 2026-05-18
**Reviewer:** Power Platform Solution Architect (expert review pass via dispatched agent)
**Scope:** 9 implementation plans + cut-line spec + decision memo
**Framework:** Power Platform Well-Architected Framework (6 pillars)
**Status:** Complete — actionable findings + verdict below

## TL;DR

**Verdict:** Ready to execute, **with conditions**.

The plan series is unusually well-thought-through. TDD discipline on plan #03 is exemplary, frontloading the decision memo + cut-line spec is best-practice ALM, cross-plan dependencies are mapped explicitly, CLAUDE.md rules are honored throughout. **But:** 16 findings surface (3 High, 7 Medium, 6 Low) and the stated "24-hour build window" is inconsistent w/ the 110–144 hour summed effort estimate.

**Top 5 things to fix before plan #01 starts:**
1. SharePoint provisioning permission contradiction (Finding 5.1)
2. Carve `plan #02a` for consolidated schema patches (Finding 5.7)
3. Implement OR explicitly defer F-06 release-numbers (Finding 5.2)
4. Add compensating actions to plan #05 multi-row create + plan #06 two-write (Findings 5.3, 5.9)
5. Reduce `useUserRole` cache + revisit Q6 licensing override (Findings 5.10, 5.8)

**Confidence:** quality of described build = **high**; hitting 24h calendar = **low**. Re-baseline calendar expectation before announcing UAT date.

---

## 1. Power Platform Well-Architected Framework — Pillar Ratings

| Pillar | Rating | Headline Strength | Headline Gap |
|--------|--------|-------------------|--------------|
| **Reliability** | Adequate-leaning-Strong | TDD plug-in + alt-key race protection at platform level | No compensating action for partial Drawing+Sheet batch creation; SP synthetic monitor never authored |
| **Security** | Adequate (2 High gaps) | Defence-in-depth correctly stated; secret rotation rehearsed | SP permission contradiction in #06; no data classification map; CSV exfil vector |
| **Performance** | Adequate | Virtualisation, paging, debounce, plug-in <100ms | Missing indexes on Search-target columns; bell polling cost underestimated |
| **Operational Excellence** | Strong | Full CI/CD from day 1, deterministic GUIDs, runbook discipline | PRT plug-in registration manual; `diff_environments.py` deferred |
| **Experience Optimization** | Strong | Fluent v9, a11y zero-violation gate, View-as-end-user | "Unknown role" empty state unspecified; #05 deep-link broken until #07 ships |
| **Cost Optimization** | **Weak** | API quota math present | Q6 licensing override abandoned $110K/yr savings w/o quantified rationale; bell polling cost real |

### Reliability detail

**Strong evidence:**
- Plan #03 22-test TDD + 50-parallel concurrency test + 10/10 consecutive pass gate (cut-line exit #3)
- Alt-keys on `enmax_acdnsequencekey`, `enmax_acdnnumber`, composite `(Drawing, Status)` — race protection at platform
- Plan #05 Step 5 explicitly handles ceiling-exceeded w/ Reservation revert + admin notify
- Plan #06 Step 5 cleanly rolls back; Step 8 idempotent reminders via `ReminderStage`

**Gaps:**
- **Multi-row Drawing+Sheet batch (plan #05 Step 5):** failure mid-loop leaves partial state; recovery is "manual via Administration model-driven app"
- **Two-write `CheckedIn → Available` (plan #06 Step 4):** fragile; failure between leaves Drawing stuck terminal-but-uncheckoutable
- **Synthetic monitor on `Sites.Selected`:** referenced in PRD risk #2 + plan #06 risks + TODO — never authored as deliverable
- **Power Automate retry policy not standardised** across the 16+ flows

### Security detail

**Strong:**
- Code App role gating = UX only; Dataverse role privileges enforce
- `Sites.Selected` scoped per Q3; transient Site Owner runbook-managed + removed
- Service-account credential in Azure Key Vault w/ quarterly rotation rehearsal
- Markdown XSS allow-list w/ tests
- Custom-action-mediated state mutations

**Gaps:**
- **No data classification map** for sensitive columns (`DeclineReason`, `OverrideJustification`, `Checkout.ValidationReason`, `ForceCheckin.Reason`)
- **CSV export at 10K rows has no per-admin daily cap** — exfiltration vector if admin account compromised
- **Send As pattern** — no per-user SMTP attribution (acceptable but not surfaced)
- **HIGH: SP permission contradiction** — provisioning flow needs Site Owner (list creation + permission grants) but documented scope is `Sites.Selected READ`
- **HIGH: Field-level security (FLS)** not specified for any column

### Performance detail

**Strong:**
- `@tanstack/react-virtual` w/ explicit "10K rows → ≤30 DOM rows" test
- Server-side paging via `$top`/`$skip`/`$count=true`
- 200ms quick-search debounce
- Plug-in <100ms happy path

**Gaps:**
- **A6 sub-second on 10K rows at risk:** Search FetchXML uses `or` w/ `contains()` on 3 columns + 11 lookup joins; **plan #02 Step 5 lists no non-unique index on `enmax_acdnnumber` or `enmax_acdntitle`**
- **No request batching** for parallel 6-lookup hydration in plan #05 Step 4
- **Bell panel polling cost underestimated** — math omits React Query revalidation + tab-rerender refetches

### Operational Excellence detail

**Strong:**
- CI/CD workflows ship day 1 (plan #01); cd-dev fails at import until #02 lands (documented + expected)
- Deterministic-GUID seed → byte-identical reference data across envs
- Managed solution for UAT, unmanaged in dev — standard ALM
- 10 runbooks tracked separately on orphan branch
- Plan #09 Step 7 rotates credential as exit criterion
- Decision memo Q1-Q7 closed before plan #01 starts

**Gaps:**
- **PRT plug-in registration is one-shot bootstrap** w/ `pac plugin push` migration as TODO — UAT promotion requires manual PRT
- **Branch protection rules documented but not code-applied** (could use `gh api`)
- **`solution/scripts/diff_environments.py` referenced but not written**
- **No release notes / changelog automation**

### Experience Optimization detail

**Strong:**
- Fluent UI v9 + ENMAX brand light/dark
- Playwright + axe-core a11y zero-violation merge gate
- 3-channel notifications w/ role-appropriate affordances
- View-as-end-user admin testing affordance
- Empty states, loading skeletons, relative timestamps, severity icons
- Defensive UX (friendly 403 toasts, "Already decided" on stale Teams cards)

**Gaps:**
- **`role: "Unknown"` UX unspecified** — user w/ pending Entra→Dataverse team sync sees empty sidebar + no error
- **Plan #05 decline deep link to `/my-items/reservations/X`** — doesn't exist until plan #07 ships; broken UX during seam
- **No copy review for email templates** — Heather/UX writer pass not scheduled

### Cost Optimization detail

**Strong:**
- Q6 licensing decision explicit (~$160K/yr) w/ EA discount expectation
- Plan #08 Step 2 API quota math (1340 calls/hr × 24 = 32K within 40K cap)
- Audit log growth sized (~180MB over 5 years)

**Gaps:**
- **Q6 override abandoned $110K/yr savings** for "simplicity" w/o quantified rationale
- **Bell polling on 670 users** = ~80K-643K calls/day for bell alone
- **No Power Automate run-count budget** despite 16 flows incl 4 scheduled
- **No cost-monitoring dashboard / alerting** (PP Admin Center provides free)
- **Audit retention = Phase 2 TODO** — unbounded growth at 100 events/day × 5y w/o archival runbook

---

## 2. Scope Coverage Gaps

### Acceptance criteria → plan ownership (all 19 mapped)

| A# | Plan | Status |
|----|------|--------|
| A1 | #05 | ✓ |
| A2 | #03 concurrency | ✓ |
| A2a | #05 Step 5 | ✓ |
| A2b | #06 Step 3 | ✓ |
| A3 | #05 (3 surfaces) | ✓ |
| A4 | #05 Step 6+8 | ✓ |
| A5 | #05 Step 2 | ✓ |
| **A6** | #07 Step 2 | ⚠ **sub-second on 10K at risk; missing indexes** |
| A7 | #06 Step 1.1 | ✓ |
| A8 | #06 Step 3 | ✓ |
| A9 | #06 Step 4 | ✓ |
| A10 | #06 Step 7 | ✓ |
| A11 | #06 Step 8 | ✓ |
| A12 | #04 + #07 | ✓ |
| **A13** | scattered | ⚠ **no coverage test asserts "every state transition writes audit event"** |
| A14 | #09 | ✓ |
| A15 | #08 Step 3 | ✓ |
| A16 | #08 Step 1+2 | ✓ |
| A17 | #04 + #07 | ✓ |
| A18 | #07 Step 5b | ✓ |
| A19 | #03 + #08 Step 6 | ✓ |

### Functional requirement gaps

- **F-06 release unused reserved numbers** — orphaned. Not in any plan. Cut-line silent. No A-criterion forces it. **Either implement or defer w/ sign-off.**
- **F-25 Entra SSO** — implicit; no automated E2E test
- **F-26 row-level access** — asserted "platform enforces"; no integration test confirms User cannot read another User's Reservation by GUID
- **F-28 PDF storage SP only** — no test asserts no other path used
- **F-31 share record UI** — orphaned. No plan implements share affordance.

### Cross-plan sequencing issues

- **Plan #07 adds `enmax_autocaduserpreference` table** — violates plan #02 "owns schema" discipline
- **Plan #06 adds `MissingSheets` column** — same violation
- **Plan #05 needs `ReservationPending` source-event value** — same violation
- **Plan #07 Step 8 ships "On Reference Data Changed" flow** — deferred from #05; sequencing fine but inventory drift
- **Plan #05 ↔ Plan #06 SharePoint provisioning contradiction:** #06 Step 2 step 4 says "all libraries pre-provisioned during dev-tenant bootstrap; runbook activity, not runtime flow." But #05 Step 5 risk mitigation assumes runtime provisioning flow exists. **Two plans disagree on runtime vs runbook.**

### Out-of-scope correctly excluded

Standards/Procedures/Forms, legacy SQL migration, .dwg, Power BI, mobile, InfoLink, auto file-rename, multi-language — all correctly absent from every plan. ✓

---

## 3. Scalability + Future-Readiness

### Phase 2 growth

- **Reference table model** — well-normalised; extending to Standards/Procedures/Forms only needs Record Type option set values (range 2-9 reserved). ✓
- **Number Sequence ceiling 9999** — decades of runway for typical combos; Critical broadcast at 9900 surfaces approach.
- **EnmaxDataGrid generic** — reused across 6+ consumers. ✓
- **Notification fan-out idempotent** — scales to ~2K users; beyond needs batched `$batch` writes.

### Hardcoded assumptions

- **`MaxExportRows=10000`** hardcoded in plan #07; should be App Config
- **Bell 50-row + 30s poll** doesn't scale linearly
- **`StaleCheckoutMonths` regex** `^(\d+,)*\d+$` fails on whitespace (e.g. `3, 6, 12`) — trim per-element
- **`recordtypechoice = 1=Drawing` w/ range 2-9 reserved** — refactor if >9 record types ever

### ALM for concurrent feature work

- Single `dev` branch + squash-merged feature branches OK for ~3 devs; Phase 2 may need ALM Accelerator or trunk-based + feature flags
- **Solution-source XML diffs hard to review** — risk for >2 simultaneous schema changes

---

## 4. Anti-Patterns Identified

1. **Multi-table OR trigger fallback to "12 child flows" (plan #07 Step 4b)** — maintenance burden. Consider plug-in on Create/Update/Delete instead.

2. **`if _modifiedby_value = service account, exit` loop guards (plans #05, #06)** — anti-pattern. Filter at trigger level (`_modifiedby_value ne <sa-id>`) so flow doesn't fire at all. Saves ~50% of flow runs.

3. **Plan #08 Step 2 dual triggers (Dataverse + scheduled) on fan-out** — flow-recursion vector via status-compute flow updating broadcast row.

4. **`useUserRole` 5-minute staleTime (plan #04)** — removed admin retains UI up to 5min. Reduce to 60s or webhook-invalidate.

5. **Plan #06 Step 1.4 Submit Revision = direct PATCH** — bypasses action-mediated convention. Audit event via flow on row update needs to be specified.

---

## 5. Single Points of Failure

- **`eec_pwrplat_svc` service account** — single auth principal for all 16 flows + seed + Code App publish. Lockout = system halt. No failover account.
- **`enmax_acdnIssueNumbers` plug-in** — bad deploy = duplicate numbers. Strong mitigation (concurrency test gate) but no canary or feature-flag.
- **`noreply-autocad@enmax.com` shared mailbox** — sole outbound email path. Mailbox deletion / Send As revocation = no approval emails. Synthetic monitor is the only signal (and isn't authored).

---

## 6. Findings Detail

### High severity (3)

| ID | Finding | Affected | Recommendation |
|----|---------|----------|----------------|
| 5.1 | SP provisioning needs Site Owner; documented scope is Sites.Selected READ only | #06 | Add precondition guard; document transient elevation as hard runbook prereq |
| 5.2 | F-06 release-numbers orphaned | None | Defer in cut-line w/ Heather sign-off OR add thin "Cancel Reservation" to #07 |
| 5.3 | Multi-row Drawing+Sheet create has no compensating action | #05 | Add compensating flow: on partial-failure, delete partial Drawings + audit + admin notify w/ burned range |

### Medium severity (7)

| ID | Finding | Affected | Recommendation |
|----|---------|----------|----------------|
| 5.4 | Bell polling cost underestimated | #08 | `refetchOnWindowFocus: true` + 5-min keepalive interval OR Dataverse webhook |
| 5.5 | Service-account loop guards mask bugs | #05, #06 | Move filter to trigger expression; saves ~50% flow runs |
| 5.6 | Search perf bet on Dataverse defaults | #02, #07 | Add non-unique indexes on Search-target columns; bench at 10K rows in #02 verification |
| 5.7 | Schema additions deferred across plans | #02, #05, #06, #07 | Carve plan #02a consolidating MissingSheets + userpreference + ReservationPending |
| 5.8 | Q6 licensing override not cost-justified | Memo, #09 | Revisit before UAT; hybrid saves ~$110K/yr |
| 5.9 | Drawing two-write CheckedIn→Available fragile | #06 | Single PATCH w/ dual audit OR scheduled cleanup for stuck CheckedIn |
| 5.10 | `useUserRole` 5-min cache stale post role-removal | #04 | 60s or Dataverse webhook |

### Low severity (6)

| ID | Finding | Affected | Recommendation |
|----|---------|----------|----------------|
| 5.11 | Outlook actionable-messages registration optimistic | #05 | Treat as best-effort enhancement; "Open in app" fallback for A3 |
| 5.12 | No automated "every state transition writes audit" coverage test | All | Add contract test in #09 acceptance pass |
| 5.13 | F-31 share UI orphaned | None | Defer w/ sign-off |
| 5.14 | Synthetic SP monitor flow never authored | #06 TODO | Add as Step 11 to #06 or small #06a |
| 5.15 | CSV export rate not capped per admin | #07 | Per-admin daily cap (3/day default); excess = Critical audit |
| 5.16 | No data classification map | #02 | Security appendix to #02 w/ FLS posture |

---

## 7. Effort Reconciliation

Cut-line spec asserts **24-hour build window**. Plan estimates sum to **110-144 hours**:

| Plan | Estimate |
|------|----------|
| #01 | 4-6h |
| #02 | 8-12h |
| #03 | 12-16h |
| #04 | 10-14h |
| #05 | 16-20h |
| #06 | 18-22h |
| #07 | 20-24h |
| #08 | 14-18h |
| #09 | 8-12h |
| **Total** | **110-144h** |

Even parallelised Claude-Code execution → ~5-6 working days at 20h/day pace. **The 24h figure is either aspirational, refers to a different time-box (e.g. UAT cutover window), or unrealistic.** Re-baseline before announcing UAT date.

For described build quality: confidence **high**.
For 24h calendar claim: confidence **low**.

---

## 8. Conditions for "Go"

Before plan #01 executes:

1. **Resolve Finding 5.1** (SP permission contradiction in #06)
2. **Carve plan #02a** (schema patches per Finding 5.7)
3. **Decide F-06** (implement or defer w/ sign-off per Finding 5.2)
4. **Add compensating actions** to #05 and #06 (Findings 5.3, 5.9)
5. **Reduce `useUserRole` cache** (Finding 5.10)
6. **Re-baseline calendar** vs sum-of-estimates

Other findings can be addressed in-flight or as plan #09 acceptance follow-up.

---

## 9. Suggested Plan Series Additions

Based on findings:

- **plan #02a** — consolidated schema patches (`MissingSheets`, `enmax_autocaduserpreference`, `ReservationPending` source-event value); blocks plan #05 start
- **plan #06a** — SP synthetic monitor flow + SP provisioning precondition guard; can ship in parallel w/ #06
- **plan #10** — cost optimization + monitoring (Power Platform Admin Center alerts, flow-run budget, audit retention policy) — post-UAT
- **plan #11** — Phase 2 readiness deferrals (F-06 if not in #07, F-31, data classification appendix, customapi.json migration for plug-in) — post-UAT planning input
