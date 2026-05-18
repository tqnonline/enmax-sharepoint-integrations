# Plan #09 — UAT Promotion + Phase 1 Acceptance Pass

**Date:** 2026-05-18
**Owner:** Engineering (Claude Code agent) + IT Admin (Nathan Relke) + Architect (Rahul Akmol) + Document Controller (Heather Quinn for sign-off)
**Spec:** `2026-05-17-phase-1-cut-line-spec.md`
**PRD refs:** sections 19 (CD-UAT workflow), 21 (runbooks), 24 (Phase 1 acceptance), 25 (out-of-scope confirmations), 26.2 (UAT promotion)
**Decisions:** `2026-05-17-open-questions-decision-memo.md`
**Estimated effort:** 8–12 hours (mostly IT-Admin runbook execution + acceptance test pass; engineering supports / verifies)
**Branch:** none — promotion uses already-merged `main` state; no code changes
**Blocked by:** Plans #01–#08 merged to `dev` and promoted to `main` via release-cut PR

## Context

This plan is the end-of-Phase-1 deployment: solution package promoted from dev tenant to ENMAX UAT tenant, all runbooks executed, all 19 acceptance criteria (A1–A19 from cut-line spec) verified, Heather signs off. No new code lands. The deliverable is a working UAT environment + a written acceptance report.

This plan does **not** include: production deployment (Phase 1 ends at UAT per cut-line spec); historical data migration (cut-line out-of-scope; legacy SQL Server stays read-only reference); any feature additions or fixes-by-default. If acceptance pass surfaces blocker bugs, they're added to a `feat/009-uat-blockers` patch branch.

## Prerequisites

- All 8 prior plans merged to `dev`
- Release-cut PR `dev → main` merged
- `cd-uat.yml` workflow runs successfully against UAT tenant (or is wired and ready to run with one human approval click via GitHub Environment)
- UAT tenant prerequisites confirmed per decision memo:
  - Q6: per-user Power Apps Premium licensing provisioned for ~70 active + 600 read-only users (procurement complete)
  - Q7: `Enable code apps` toggle ON in ENMAX UAT tenant (confirmed via Power Platform Admin Center)
  - Q4: UAT tenant Dataverse region = Canada Central
  - Q5: shared mailbox `noreply-autocad@enmax.com` exists; service account has `Send As`
  - Q3: service account has `Sites.Selected` READ on Generation Drawings UAT site
  - Q1: connection-reference prefix `enmax_connref_*` separate from env-var prefix `enmax_envar_*` (matters at solution import time)
- Three Entra security groups exist in ENMAX UAT: `sg-enmax-autocad-users/approvers/admins`
- At least 3 test accounts (one per role) seeded in UAT for smoke pass

## Out of Scope for This Plan

- Production deployment (Phase 2 / separate project)
- Historical data migration from legacy SQL Server (cut-line out-of-scope)
- Bug fixes — handled on a patch branch if surfaced
- User training material — separate handoff to Heather, not engineering scope
- Phase 2 backlog grooming (handled by runbook-led retrospective post-UAT sign-off)

## Step 1 — Pre-Flight Checklist

Verify every runbook from PRD section 21 has been executed against the UAT tenant. Each runbook owner confirms completion in writing (Teams message or PR comment).

| Runbook | Owner | Confirmation required |
|---------|-------|----------------------|
| 001 — Service account provisioning | IT Admin | `eec_pwrplat_svc@enmax.com` exists; member of all 3 Entra groups; Basic User role granted on UAT environment |
| 002 — Entra security groups | IT Admin | Three groups exist; populated with at least one test user per role; group → Dataverse team sync verified (post-solution-import) |
| 003 — Power Platform environment setup | IT Admin | UAT environment provisioned; `Enable code apps` ON; Dataverse region = Canada Central; capacity adequate (storage + API quota) |
| 004 — SharePoint site + library creation | IT Admin / Site Owner | Generation Drawings site collection exists; transient Site Owner permission granted to service account for first provisioning run |
| 005 — Content type + term set binding | IT Admin | `Generation Drawing Information` content type exists site-wide; `Systems` + `Vendors` term sets populated |
| 006 — Connection references on service account | IT Admin | Every connection reference in the solution authenticated as service account (Office 365 Outlook, Teams, Dataverse, SharePoint) |
| 007 — Plug-in registration | IT Admin / Dev | IssueNumbers assembly registered post-solution-import; sandbox isolation; custom action step active |
| 008 — Teams channel + bot permissioning | IT Admin | Power Automate flow bot approved by tenant Teams admin for 1:1 adaptive cards (Q2 decision) |
| 009 — Key Vault secrets + GitHub Environments | IT Admin | Service account credential in Azure Key Vault (UAT); GitHub Environment `uat` populated w/ DEV_*→UAT_* secret set; Azure login action tested |
| 010 — UAT deployment checklist | IT Admin / Architect | Runbook itself completed end-to-end (this plan's verification is the test of runbook #010) |

**Output:** sign-off table in plan #09 PR description (or GitHub Issue tracking UAT promotion) with one checkmark per runbook + initials of confirming owner.

## Step 2 — Solution Export (Managed) from Dev

```powershell
Set-Location D:\Developer\Github\enmax-autocad

# Authenticate to dev tenant
pac auth create --environment $env:DEV_POWER_APPS_ENV_ID

# Export managed solution (UAT imports managed; dev keeps unmanaged for source)
pac solution export `
  --path solution/build/enmaxautocadsln_managed.zip `
  --name enmaxautocadsln `
  --managed true

# Optional: also export unmanaged for archival
pac solution export `
  --path solution/build/enmaxautocadsln_unmanaged.zip `
  --name enmaxautocadsln `
  --managed false

# Sanity check
Get-ChildItem solution/build/*.zip
```

**Why managed for UAT:** managed solutions are the supported Power Platform ALM path; they prevent ad-hoc edits in UAT (the source of truth is dev's `solution/src/`). Unmanaged in dev (developers can iterate); managed in UAT/prod (controlled deploys only).

## Step 3 — `cd-uat.yml` Trigger + Manual Approval

```powershell
# Push to main (already done by release-cut PR; this just confirms)
git checkout main
git pull
git log -1                                  # confirm latest scaffold commit

# Trigger cd-uat.yml manually (alternative: it runs automatically on main push;
# but UAT first-deploy is best run explicitly via workflow_dispatch)
gh workflow run cd-uat.yml --ref main
```

**Workflow pauses at GitHub Environment `uat` approval gate.** IT Admin (or architect) clicks **Approve** in GitHub Actions UI. Workflow then proceeds:

1. Install Node 20, npm 10, Python 3.11, .NET 10 SDK
2. Install PAC CLI
3. Install Code App deps (`npm ci`)
4. Build Code App (`npm run build`)
5. Install Python deps
6. **Pack solution** (`python solution/scripts/pack.py`) — uses `solution/src/` from main branch
7. **Import solution** (`python solution/scripts/import.py` with UAT env vars from GitHub secrets)
8. **Seed deterministic master data** (`python solution/scripts/seed.py`):
   - APP_CONFIG_SHARED_MAILBOX env var = `noreply-autocad@enmax.com` (UAT prod-grade mailbox per Q5)
   - All reference data seeded with same deterministic GUIDs as dev (byte-identical row IDs)
9. **Publish Code App** (`npx power-apps push` against UAT env)
10. **Capture play URL** from push output → store as `UAT_APP_PLAY_URL` GitHub secret for plan #09 smoke

**Expected duration:** ~15–25 minutes end-to-end (PAC import is the slow step).

**Failure paths:**
- Step 7 import fails on missing connection reference: re-run runbook #006, re-trigger workflow
- Step 8 seed fails on missing option set: confirm plan #02's 18 option sets present in managed solution; if missing, fix in dev → re-export → re-promote
- Step 9 push fails on Enable Code Apps toggle: re-confirm Q7 in UAT tenant; toggle on; re-trigger workflow

## Step 4 — Post-Deploy Manual Configuration

Some steps cannot be automated by `cd-uat.yml`:

1. **Register IssueNumbers plug-in** in UAT (per runbook #007):
   - Open Plug-in Registration Tool (PRT): `pac tool prt`
   - Connect to UAT env
   - Step automatically discovered post-solution-import? **Verify** — if the customapi.xml from solution import auto-registers, skip; otherwise register manually + re-export solution from UAT (one-time only) → unpack to confirm registration metadata captured
2. **Provision SharePoint libraries** for every Active Asset-Unit row:
   - Service account holds transient Site Owner grant for this step (per runbook #004)
   - Trigger the `On Asset-Unit Activated → Provision Library` flow manually for each Asset-Unit row via maker UI Run-now, OR
   - Insert a small bulk-trigger script: PATCH every Active Asset-Unit row's `enmax_acdnsplibraryurl` to null → triggers re-provisioning flow for all rows in one pass
   - Confirm every library exists at `https://enmax.sharepoint.com/sites/GenerationDrawings/{BB-AA-UU}` w/ content type bound + permissions applied
   - **Remove transient Site Owner permission** from service account after provisioning completes
3. **Verify Entra → Dataverse team sync**:
   - Add a test user to `sg-enmax-autocad-users` in Entra
   - Wait ≤30 min for M365 group → Dataverse team sync
   - Confirm user appears in `team-enmax-autocad-users` membership in maker UI
   - Confirm user can open the Code App via play URL
4. **Verify shared mailbox + Send As**:
   - From Power Automate maker, manually trigger `Send_Approval_Needed_Email` child flow with a test payload
   - Confirm email arrives at recipient inbox from `noreply-autocad@enmax.com`
5. **Verify Teams bot 1:1 delivery**:
   - Manually trigger a test broadcast fan-out → confirm adaptive card arrives in a test admin's personal Teams chat
   - If blocked: fall back to private Teams channel per Q2 decision; document switch in this plan's notes

## Step 5 — Phase 1 Acceptance Pass (A1–A19)

Per cut-line spec exit criteria #1: "A clean import of the solution package into a freshly-provisioned tenant produces an environment that passes all 19 acceptance criteria."

Run every acceptance criterion against the UAT environment. Record pass/fail in the acceptance report (table below). Engineer + IT Admin co-execute; Heather observes.

| # | Criterion (from PRD section 24) | Test approach | Owner |
|---|---------------------------------|---------------|-------|
| A1 | End user reserves 1–N drawings; approval notification fires via email + Teams + in-app | User submits reservation; admin receives 3 channels | Eng + Heather |
| A2 | Concurrent reservation requests get distinct, contiguous numbers; zero retries | Run concurrency test from plan #03 against UAT Dataverse | Eng |
| A2a | Approval creates Drawing + Sheet rows w/ deterministic filenames; no SharePoint writes | Approve; inspect Dataverse rows; confirm SharePoint Library has zero new files until user uploads | Eng |
| A2b | Revision submit indexes SharePoint, writes Sheet URLs, surfaces missing sheets | User uploads 2 of 3 sheets; submit revision; approver panel shows 1 missing | Eng + Heather |
| A3 | Admin approves from inbox / Teams / in-app grid → same Dataverse outcome | **Primary path:** click "Open in app →" link in email → approve via Code App grid. **Best-effort path:** if Outlook actionable-messages registration approved for `noreply-autocad@*` sender, inline Approve/Decline buttons work. **A3 passes if Open-in-app + Teams + in-app paths all converge on same outcome** — actionable buttons are bonus per architecture review Finding 5.11. Test each of 3 paths on 3 separate reservations; compare audit log. | Eng |
| A4 | Decline requires reason; reason delivered verbatim to requester | Decline w/ reason "test rationale"; user receives email + Teams + in-app w/ exact string | Eng + Heather |
| A5 | Soft validation override on invalid BB-AA captures typed reason, stored w/ flag | Submit reservation w/ non-approved combo; override; Reservation row has Override=true + OverrideReason populated | Eng |
| A6 | Search by any 6 segments + title + ENMAX# + vendor; sub-second on 10K rows | Pre-seed UAT w/ 10K Drawing rows via bulk script; measure search latency w/ DevTools Network tab | Eng |
| A7 | Check-out records Dataverse state only; no SharePoint lock; library URL surfaced | Check out a Drawing; confirm SP file has no checkout lock; Drawing panel shows library URL hyperlink | Eng + Heather |
| A8 | Revision submit indexes library by prefix, records URLs, flags missing sheets, 3-channel notification | Same as A2b; verify approver email + Teams + in-app all arrive | Eng + Heather |
| A9 | Approver validates, approves; Drawing → CheckedIn; user notified; no SharePoint write | Approve revision; inspect Drawing.CurrentRevision bumped + state=Available; user gets notification; SP file unchanged | Eng |
| A10 | Admin force-checkin w/ typed reason; override audited | Admin forces a checkout closed; audit log shows ForceCheckedIn event w/ reason | Eng |
| A11 | Scheduled flow emits stale-checkout reminder at 3-month boundary | Time-shift a test Checkout: CheckedOutOn = utcNow() - 4 months; trigger flow manually; verify user notification + ReminderStage=ThreeMonth | Eng |
| A12 | Single Admin Mode locks app to admins; *View as end user* toggle; non-dismissible banner | Admin toggles SingleAdminMode in Settings; User account opens app → banner visible + actions disabled; Admin enables View-as-end-user → admin sees user view | Eng + Heather |
| A13 | Audit log captures every state transition, override, config change | Sample 20 audit events from prior tests; verify every action represented | Eng |
| A14 | Clean import produces env passing every test above | This plan IS the test — pass A1-A19 → A14 passes by construction | All |
| A15 | In-app notifications: bell panel for approvals, validations, reminders, broadcasts; read state + deep links | Smoke-test bell panel on each event type; click each → marks read + navigates correctly | Heather |
| A16 | Admin authors Broadcast w/ all fields; hourly fan-out w/o duplicates; users see on Home + bell; can dismiss/acknowledge | Admin creates Broadcast w/ RequiresAck=true; verify fan-out cadence; users acknowledge; dismissal recorded | Eng + Heather |
| A17 | Every screen has persistent sidebar / command bar / header / footer; every grid has search/sort/filter/paging/visibility/CSV | Heather walks the entire app; ticks off shell elements per page | Heather |
| A18 | Admin seeds sequences per-row w/ audit; bulk CSV import accepts legacy roster + upserts atomically | Test CSV w/ 5 valid + 1 invalid row → batch rejected; fix CSV → import succeeds; audit events written | Eng |
| A19 | Numbers always 4-digit / 3-digit zero-padded; refusal at 9999; Warning at 9000, Critical at 9900 | Pre-seed a Number Sequence to LastIssued=9899; issue 1 → confirm Status=Warning; LastIssued=9899→9999 → confirm refusal w/ exact PRD message; verify Critical broadcast at 9900 (from plan #08 Step 6) | Eng |

**Pass criteria:** every row checked PASS. Any FAIL → patch branch `feat/009-uat-blockers` created; bug fixed; re-promoted; re-tested; only failed criteria re-run.

**Acceptance report template:**

```markdown
# Phase 1 Acceptance Report — UAT

**Date executed:** 2026-MM-DD
**UAT environment:** {url}
**Executed by:** {engineer-name}, {it-admin-name}
**Observed by:** Heather Quinn

| # | Criterion | Result | Evidence | Notes |
|---|-----------|--------|----------|-------|
| A1 | ... | PASS | screenshot-001.png | |
| A2 | ... | PASS | concurrency-test-output.log | 50 parallel calls, 0 duplicates, 0 gaps |
| ... |
| A19 | ... | PASS | ... | |

**Overall:** PASS (19/19)

**Sign-off:**

- [ ] Heather Quinn (Document Controller): _________________ Date: _______
- [ ] Nathan Relke (IT Admin):              _________________ Date: _______
- [ ] Rahul Akmol (Architect):              _________________ Date: _______
```

## Step 6 — Concurrency + Performance Re-Runs (UAT)

Per cut-line spec exit criteria #3 ("Concurrency test passes 10 consecutive runs"):

```powershell
# Run concurrency test against UAT 10 times
1..10 | ForEach-Object {
  Write-Host "Run $_..."
  Set-Location solution/plugins/IssueNumbers.Tests
  $env:DATAVERSE_URL = "https://<uat-org>.crm3.dynamics.com"
  $env:DATAVERSE_CLIENT_ID = "<uat-sp-client>"
  $env:DATAVERSE_CLIENT_SECRET = "<from-uat-key-vault>"
  $env:DATAVERSE_TENANT_ID = "<uat-tenant>"
  dotnet test --filter "Category=Integration" --no-build
}
```

**Expected:** 10/10 pass; zero duplicates; zero gaps. Document run log in acceptance report.

Per cut-line spec exit criteria #4 ("Accessibility audit returns zero violations on every page"):

```powershell
Set-Location apps/code-app
$env:SMOKE_URL = $env:UAT_APP_PLAY_URL
npx playwright test --grep @a11y
```

Expected: zero new axe-core violations.

## Step 7 — Service-Account Credential Rotation Rehearsal

Per cut-line spec exit criteria #5 ("Service account credentials are stored in Azure Key Vault, rotated once, and a deploy succeeds against the rotated credential."):

1. Generate new client secret for service account in Entra
2. Update Azure Key Vault secret w/ new value (per runbook #009)
3. Update GitHub Environment `uat` `UAT_SP_CLIENT_SECRET` secret
4. Trigger `cd-uat.yml` workflow_dispatch with **no code change** — should re-deploy successfully w/ rotated secret
5. Revoke old secret in Entra
6. Document rotation date + next-rotation-due date (quarterly per PRD section 12.6)

## Step 8 — Heather Sign-Off

Per cut-line spec exit criteria #6 ("UAT smoke pass executed by Heather and signed off in writing"):

1. Heather walks through all 19 acceptance criteria personally (engineer drives the UI, Heather observes)
2. Heather writes acceptance + sign-off in the acceptance report (Step 5 template)
3. Sign-off recorded in:
   - GitHub Issue `Phase 1 UAT Acceptance` (closed with sign-off as final comment)
   - Acceptance report committed to `runbooks` orphan branch under `runbooks/uat-acceptance-2026-MM-DD.md`
4. Email to project sponsor w/ link to acceptance report

## Step 9 — Cut-line Spec Sign-Off Closure

Update `2026-05-17-phase-1-cut-line-spec.md` (specs branch) with:

```markdown
## Phase 1 Status

**Status:** UAT-Accepted as of 2026-MM-DD
**Acceptance report:** runbooks/uat-acceptance-2026-MM-DD.md
**Sign-off:** Heather Quinn, Nathan Relke, Rahul Akmol
**Outstanding bugs:** none / [list]
**Phase 2 backlog:** captured in retrospective
```

Commit to specs branch.

## Verification — End-to-End Checklist

```powershell
# Confirm UAT environment matches dev byte-for-byte on master data
python solution/scripts/diff_environments.py --dev $env:DEV_DATAVERSE_URL --uat $env:UAT_DATAVERSE_URL
# Expected: zero diffs on reference tables; zero diffs on App Configuration (except per-env overrides like SharedMailboxAddress)

# Confirm GitHub Environment secrets populated
gh secret list --env uat

# Confirm UAT app accessible
Invoke-WebRequest $env:UAT_APP_PLAY_URL -Method HEAD
# Expected: 200 OK

# Confirm acceptance report committed
git -C .worktrees/runbooks log --oneline | Select-String "uat-acceptance"
```

**Acceptance (plan #09 itself):**
- All 10 runbooks confirmed executed
- `cd-uat.yml` ran successfully end-to-end
- All 19 Phase 1 acceptance criteria PASS
- Concurrency test 10/10 PASS against UAT
- Accessibility audit zero violations
- Service-account credential rotated successfully
- Heather signed off in writing
- Cut-line spec updated with UAT-Accepted status
- Acceptance report committed to runbooks branch

## Critical Files to Read Before Starting

| File | Why |
|------|-----|
| Cut-line spec exit criteria (6 items) | The definition of "Phase 1 done" |
| Decision memo Q1–Q7 | Configuration locked answers for UAT |
| Plan #01 Step 5 cd-uat.yml workflow | What runs in the promotion pipeline |
| Plan #02 seed scripts | Per-env env var overrides |
| Runbooks 001–010 (when authored on runbooks branch) | Step-by-step procedures for IT-Admin handoffs |
| PRD section 24 acceptance criteria | Verbatim source for A1–A19 tests |

## Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| Runbook not actually executed despite checkbox | Each runbook owner provides evidence (screenshot, command output) attached to PR / Issue tracking UAT promotion |
| Connection references fail to import (Q1 prefix mismatch) | Q1 locked decision = `enmax_connref_*` separate; verify in `solution/src/connectionreferences/` before promotion. If wrong: fix in dev → re-export → re-promote (one-time per fix) |
| UAT Dataverse region mismatch (Q4 assumed Canada Central, actually different) | Verify in Power Platform Admin Center → Environments → UAT → URL endpoint. If wrong: update `DATAVERSE_GEO` env var in cd-uat.yml; redeploy |
| Per-user Premium licensing not provisioned for full ~670 user audience | Q6 procurement decision; surface to project sponsor; soft-launch w/ Approvers + Admins (smaller seat count) until procurement completes; document in acceptance report |
| Teams 1:1 bot blocked in ENMAX tenant despite Q2 confirmation | Fall back to private channel per Q2 fallback path; document switch; 2 of 3 channels (email + in-app) still operational |
| SharePoint libraries fail to provision for all Asset-Units in single run | Document error; re-run flow per failing row; if persistent, IT Admin manually creates via SP UI + runs binding flow afterward. Documented as runbook #004 follow-up |
| Concurrency test fails on UAT (rare) | First-class blocker; investigate w/ Eng (plan #03 author); patch + re-deploy; do NOT sign off acceptance until 10/10 pass |
| Service-account secret rotation breaks deploy mid-promotion | Rotation done AFTER initial deploy succeeds (Step 7 after Step 5); rollback to prior secret via Key Vault version history if rotation fails; re-attempt rotation in next maintenance window |
| Heather not available for sign-off window | Pre-schedule Heather's time; PBK as backup signer with same authority |
| Acceptance test reveals a missed scope item (e.g. forgot Pinned-broadcast on Home) | Add to `feat/009-uat-blockers` patch; fix in dev; re-promote; re-test only affected criterion. Don't expand scope beyond what's needed for the failed criterion. |

## TODOs Left in This Plan

- **`solution/scripts/diff_environments.py` script:** verification step references this script; not yet written. Author as small follow-up before plan #09 execution. Functionality: query reference tables + App Config in both envs; assert deterministic GUIDs + values match (except per-env keys like SharedMailboxAddress).
- **Phase 2 backlog capture:** post-acceptance retrospective; out of plan #09 scope but should be scheduled.
- **Production deployment plan (Phase 1.5 or Phase 2):** UAT acceptance is the formal Phase 1 exit; production rollout is its own plan w/ own runbook addenda. Out of scope here.
- **User training material handoff:** Heather authors / coordinates separately; engineering provides app walkthrough video link if requested.
