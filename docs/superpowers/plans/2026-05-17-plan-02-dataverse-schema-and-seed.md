# Plan #02 — Dataverse Schema + Seed

**Date:** 2026-05-17
**Owner:** Engineering (Claude Code agent + human reviewer; second reviewer required only for plug-in registration changes per CLAUDE.md Rule 14)
**Spec:** `2026-05-17-phase-1-cut-line-spec.md`
**PRD refs:** sections 7 (data architecture), 9 (numbering scheme), 13 (App Configuration), 22 (deterministic GUID strategy)
**Decisions:** `2026-05-17-open-questions-decision-memo.md`
**Estimated effort:** 8–12 hours (one full day; bootstrap UI work is the slow part)
**Branch:** `feat/002-dataverse-schema-and-seed` → PR to `dev`
**Blocked by:** Plan #01 merged to `dev`

## Context

Plan #01 produced an empty repo skeleton. Plan #02 fills `solution/src/` with the full Dataverse schema (publisher, solution, tables, columns, relationships, alternate keys, global option sets) and `solution/seed/` with deterministic-GUID master data plus the seed loader script that drives identical state across dev / UAT / prod. After plan #02 merges, `cd-dev.yml` can run end-to-end: pack the solution, import it into the dev tenant, run `seed.py`, and produce a freshly-provisioned environment containing every reference value, every App Configuration default, and zero rows in any transactional table.

This plan does **not** include the IssueNumbers plug-in (plan #03) or any Code App work (plan #04+). The schema must exist before either of those plans can build against it.

## Prerequisites

- Plan #01 merged to `dev`. Scaffold (`solution/`, `apps/code-app/`, CI workflows, Python tooling) in place.
- Dev tenant provisioned per runbook #003. Specifically:
  - `Enable code apps` toggle ON
  - Service account `eec_pwrplat_svc@tqnonline.onmicrosoft.com` (dev variant) exists with System Customizer role
  - Dataverse region `can` (Canada Central) confirmed
  - Dev environment ID captured for use in `.env.local`
- Local Python venv from plan #01 still functional; deps installed.
- PAC CLI authenticated to dev tenant: `pac auth create --environment <DEV_ENV_ID>`
- Maker UI access for service account at `https://make.powerapps.com/`
- Master-data workbook (`Master data.xlsx`) accessible at `.worktrees/specs/docs/superpowers/specs/_assets/master-data/`

## Out of Scope for This Plan

- IssueNumbers custom action + plug-in (plan #03) — schema includes the Number Sequence table this action will mutate, but registration of the custom action and plug-in code is deferred.
- Code App data access layer (plan #04+) — schema is consumed but the React-side React Query hooks ship later.
- Power Automate flow definitions (plan #05+) — flows reference these tables but ship independently.
- Model-driven admin app — generated post-schema; tracked separately.
- Real Number Sequence rows for legacy cut-over — bulk-CSV import path is built and tested with synthetic data; real legacy data import is a runbook activity at UAT promotion.
- SharePoint library provisioning — Asset-Unit rows are seeded; SharePoint library creation flow ships in plan #06 (Check-Out/Check-In track).

## Approach: Maker-First Bootstrap, XML Diff Thereafter

Power Platform CLI (`pac`) operates at the solution-zip level — it can pack, unpack, import, and export solutions, but does **not** expose direct CRUD for table metadata. Two viable authoring paths exist:

1. **Maker UI bootstrap (chosen).** Author the schema interactively in `https://make.powerapps.com/`, export the unmanaged solution, `pac solution unpack` to `solution/src/`, commit the unpacked XML. Subsequent edits go through maker → export → unpack OR direct XML edit (XML is human-readable but tedious for complex changes).

2. **PowerShell scripted metadata definition.** Use `Microsoft.PowerApps.PowerShell` + Dataverse Web API to author tables programmatically. Reproducible from source, but verbose (~200 LOC per table) and brittle against platform schema-evolution updates.

Approach #1 chosen for Phase 1. Reasoning: ~22 tables is a one-time bootstrap; the unpacked XML is the version-controlled source of truth thereafter; subsequent column-add or rename operations are quick in maker. A scripted approach optimises for table-count growth that Phase 1 does not have.

**Discipline:** every schema change MUST go through maker → export → unpack → commit. Direct XML edits are allowed only for one-line fixes (e.g. a typo in a description); anything structural goes through the maker round-trip to avoid hand-rolled XML diverging from what `pac solution import` validates.

## Step 1 — Publisher + Solution shell

**Publisher:**

- Display name: `Enmax Engineering Corporation`
- Unique name: `Enmax`
- Prefix: `enmax` (matches PRD section 7 — every table is `enmax_autocad*`, every column is `enmax_acdn*`)
- Option-set value prefix: `10000` (default; reserves the 10000–19999 range for this publisher)

**Solution:**

- Display name: `Enmax AutoCAD Document Numbering System`
- Unique name: `enmaxautocadsln`
- Version: `1.0.0.0` (semver-style; bumped on each release-cut PR)
- Type: Unmanaged in dev; exported as both unmanaged (for source) and managed (for UAT import)
- Description: One-paragraph summary pointing at the PRD path

**Commands (run in PowerShell from repo root after maker-UI authoring):**

```powershell
# One-time bootstrap: authenticate
pac auth create --environment $env:DEV_POWER_APPS_ENV_ID

# After schema is authored in maker, export the unmanaged solution
pac solution export `
  --path solution/build/EnmaxAutoCADNumbering_unmanaged.zip `
  --name enmaxautocadsln `
  --managed false

# Unpack into source tree
pac solution unpack `
  --zipfile solution/build/EnmaxAutoCADNumbering_unmanaged.zip `
  --folder solution/src `
  --packagetype Unmanaged `
  --allowDelete true

# Inspect diff
git diff solution/src/
```

`solution/build/` is gitignored (already covered by `solution/src/**/*.zip` in `.gitignore`); only the unpacked `solution/src/` tree is committed.

## Step 2 — Global Option Sets

Every Choice column references a global option set (no local picklists, per PRD section 7.1 convention). Define these in maker before authoring tables.

| Schema name                        | Display name            | Values (int code → label)                                                                                                                                                   |
| ---------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enmax_acdn_reservationstatus`     | Reservation Status      | 0=None, 1=Pending, 2=Approved, 3=Declined, 4=Cancelled                                                                                                                      |
| `enmax_acdn_drawingstate`          | Drawing State           | 0=None, 1=Available, 2=CheckedOut, 3=AwaitingValidation, 4=CheckedIn, 5=Obsolete, 6=Void                                                                                    |
| `enmax_acdn_sheetstate`            | Sheet State             | 0=None, 1=PendingInitialUpload, 2=Available, 3=CheckedOut, 4=AwaitingValidation, 5=Obsolete, 6=Void                                                                         |
| `enmax_acdn_checkoutstatus`        | Checkout Status         | 0=None, 1=Open, 2=AwaitingValidation, 3=ClosedApproved, 4=ClosedDeclined, 5=ClosedForced                                                                                    |
| `enmax_acdn_checkoutreminderstage` | Checkout Reminder Stage | 0=None, 1=ThreeMonth, 2=SixMonth, 3=TwelveMonth                                                                                                                             |
| `enmax_acdn_sequencetype`          | Sequence Type           | 1=New, 2=Existing                                                                                                                                                           |
| `enmax_acdn_numbersequencestatus`  | Number Sequence Status  | 0=None, 1=Healthy, 2=Warning, 3=Critical, 4=Exhausted                                                                                                                       |
| `enmax_acdn_appconfigvaluetype`    | App Config Value Type   | 1=Boolean, 2=Integer, 3=String, 4=Json                                                                                                                                      |
| `enmax_acdn_auditevent`            | Audit Event             | 1=Created, 2=StateChanged, 3=ApprovalGranted, 4=ApprovalDenied, 5=OverrideUsed, 6=ForceCheckedIn, 7=ConfigChanged, 8=ReferenceDataChanged                                   |
| `enmax_acdn_auditsource`           | Audit Source            | 1=CodeApp, 2=AdminApp, 3=Flow, 4=Action                                                                                                                                     |
| `enmax_acdn_recordstatus`          | Record Status           | 1=Active, 2=Inactive                                                                                                                                                        |
| `enmax_acdn_notificationseverity`  | Notification Severity   | 0=None, 1=Info, 2=Success, 3=Warning, 4=Critical                                                                                                                            |
| `enmax_acdn_sourceevent`           | Source Event            | 0=None, 1=ReservationApproved, 2=ReservationDeclined, 3=CheckinValidated, 4=CheckinDeclined, 5=StaleCheckoutReminder, 6=BroadcastPublished, 7=ForceCheckin, 8=SystemMessage |
| `enmax_acdn_broadcastseverity`     | Broadcast Severity      | 0=None, 1=Info, 2=Warning, 3=Critical                                                                                                                                       |
| `enmax_acdn_broadcastaudience`     | Broadcast Audience      | 0=None, 1=Users, 2=Approvers, 3=Admins, 4=Everyone (multi-select column)                                                                                                    |
| `enmax_acdn_broadcaststatus`       | Broadcast Status        | 0=None, 1=Draft, 2=Scheduled, 3=Active, 4=Expired, 5=Retired                                                                                                                |
| `enmax_acdn_systemscopetype`       | System Scope Type       | 1=AssetOnly, 2=DomainOnly                                                                                                                                                   |
| `enmax_acdn_recordtypechoice`      | Reservation Record Type | 1=Drawing (Phase 1 only; reserved range 2–9 for Phase 2 Standards/Procedures/Forms)                                                                                         |

The `0=None` row exists on every option set per PRD section 22 ("Seed loader writes value 0 named None first ... Loader fails fast if any option set is missing the 0 = None row"). Numeric sequencing starts at 1 for real values.

## Step 3 — Reference tables

Author each reference table with the consistent shape from PRD section 7.3:

| Column       | Type                               | Required | Notes                                 |
| ------------ | ---------------------------------- | -------- | ------------------------------------- |
| Code         | Single line text (max 32)          | Yes      | Indexed, unique within table          |
| Display Name | Single line text (max 128)         | Yes      | Primary name column                   |
| Description  | Multiline text (max 2000)          | No       | Original full string for traceability |
| Status       | Choice (`enmax_acdn_recordstatus`) | Yes      | Default Active                        |
| Sort Order   | Whole number                       | No       | Defaults 0                            |

**Tables (in dependency order — author parents before children):**

| Logical name                 | Display                    | Extra columns                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `enmax_autocadbusiness`      | Business                   | —                                                                                                                                                                                                                                                                                                                                  |
| `enmax_autocadasset`         | Asset                      | `enmax_acdnbusiness` (Lookup → Business) — _every Asset is owned by exactly one Business_                                                                                                                                                                                                                                          |
| `enmax_autocadunit`          | Unit                       | `enmax_acdnasset` (Lookup → Asset) — _every Unit is scoped to a specific Asset_                                                                                                                                                                                                                                                    |
| `enmax_autocaddomain`        | Domain                     | —                                                                                                                                                                                                                                                                                                                                  |
| `enmax_autocadsystem`        | System                     | —                                                                                                                                                                                                                                                                                                                                  |
| `enmax_autocadkind`          | Kind                       | —                                                                                                                                                                                                                                                                                                                                  |
| `enmax_autocadrecordtype`    | Record Type                | —                                                                                                                                                                                                                                                                                                                                  |
| `enmax_autocadrecordphase`   | Record Phase               | —                                                                                                                                                                                                                                                                                                                                  |
| `enmax_autocadvendor`        | Vendor                     | `enmax_acdnnormalisedname` (Single line text, indexed, unique) — _natural key for deterministic GUID_                                                                                                                                                                                                                              |
| `enmax_autocadbusinessasset` | Approved BB–AA Combination | `enmax_acdnbusiness` (Lookup → Business, required) + `enmax_acdnasset` (Lookup → Asset, required) — \*junction with no other columns; primary name is `BB                                                                                                                                                                          | AA` concat\* |
| `enmax_autocadassetunit`     | Asset–Unit                 | `enmax_acdnasset` (Lookup → Asset, required) + `enmax_acdnunit` (Lookup → Unit, required) + `enmax_acdnsharepointlibraryurl` (URL) — _junction; library URL written by SharePoint provisioning flow in plan #06_                                                                                                                   |
| `enmax_autocadsystemscope`   | System Scoping Rule        | `enmax_acdnsystem` (Lookup → System, required) + `enmax_acdnscopetype` (Choice `enmax_acdn_systemscopetype`, required) + `enmax_acdnscopevalue` (Single line text) + `enmax_acdnactive` (Yes/No, default Yes) — _scope value is the Code of the Asset or Domain depending on scope type; not a Lookup because target table varies_ |

## Step 4 — Transactional tables

Author per PRD section 7.2 verbatim. Refer to the literal column lists in the PRD extract; this plan does not re-state them column-by-column to avoid drift between plan and PRD.

Tables to author:

- `enmax_autocadreservation` (Reservation)
- `enmax_autocaddrawing` (Drawing)
- `enmax_autocadsheet` (Sheet)
- `enmax_autocadcheckout` (Checkout)
- `enmax_autocadnumbersequence` (Number Sequence) — Sequence Key column is the **alternate key** that the IssueNumbers plug-in (plan #03) will use as its locking target
- `enmax_autocadappconfig` (App Configuration)
- `enmax_autocadauditevent` (Audit Event)
- `enmax_autocadinappnotification` (In-App Notification)
- `enmax_autocadbroadcast` (Broadcast)
- `enmax_autocadbroadcastdismissal` (Broadcast Dismissal)

**Autonumber configuration (Reservation):**

- Column: `enmax_acdnreservationid`
- Format: `RES-{SEQNUM:00000}`
- Seed: 1 (so first reservation is `RES-00001`)

**Required fields, default values, max lengths:** match PRD section 7.2 columns table verbatim.

## Step 5 — Indexes + alternate keys

Per PRD section 7.5:

**Unique indexes (defined as alternate keys in Dataverse):**

- `enmax_autocadnumbersequence.enmax_acdnsequencekey` (single-column)
- `enmax_autocaddrawing.enmax_acdnnumber` (single-column)
- `enmax_autocadsheet` composite `(enmax_acdndrawing, enmax_acdnsheetnumber)`
- `enmax_autocadcheckout` composite `(enmax_acdndrawing, enmax_acdnstatus)` — **only valid because at most one Checkout per Drawing may be in Open state at a time; closed Checkouts have distinct status values per PRD section 7.2**. Dataverse alternate keys allow multiple "closed" rows because their Status value differs from Open.
- `enmax_autocadbroadcastdismissal` composite `(enmax_acdnbroadcast, enmax_acdnuser)`
- `enmax_autocadbusinessasset` composite `(enmax_acdnbusiness, enmax_acdnasset)` (enforces approved combos uniquely)
- `enmax_autocadassetunit` composite `(enmax_acdnasset, enmax_acdnunit)`

**Non-unique indexes (set via maker UI on the column properties):**

- Status on Reservation, Drawing, Checkout, Audit Event

## Step 6 — Solution pack / unpack scripts

Plan #01 shipped empty `pack.py`, `import.py`, `export.py` skeletons. Plan #02 implements them.

**`solution/scripts/pack.py`:**

```python
"""Pack solution/src/ into solution/build/EnmaxAutoCADNumbering_unmanaged.zip via PAC CLI."""

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SRC = REPO_ROOT / "solution" / "src"
BUILD = REPO_ROOT / "solution" / "build"
ZIP = BUILD / "EnmaxAutoCADNumbering_unmanaged.zip"


def main() -> int:
    BUILD.mkdir(exist_ok=True)
    cmd = [
        "pac", "solution", "pack",
        "--folder", str(SRC),
        "--zipfile", str(ZIP),
        "--packagetype", "Unmanaged",
    ]
    result = subprocess.run(cmd, check=False)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
```

**`solution/scripts/import.py`:**

```python
"""Import solution/build/EnmaxAutoCADNumbering_unmanaged.zip into the target Dataverse environment.

Reads DATAVERSE_URL, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_TENANT_ID
from the environment. Uses PAC CLI; assumes `pac auth` has been run or that
the CI workflow has set up authentication via service principal.
"""

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ZIP = REPO_ROOT / "solution" / "build" / "EnmaxAutoCADNumbering_unmanaged.zip"


def main() -> int:
    if not ZIP.exists():
        print(f"ERROR: {ZIP} not found. Run pack.py first.", file=sys.stderr)
        return 2

    cmd = [
        "pac", "solution", "import",
        "--path", str(ZIP),
        "--publish-changes",
        "--activate-plugins",
    ]
    result = subprocess.run(cmd, check=False)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
```

**`solution/scripts/export.py`:** export the current unmanaged solution from the connected dev env to `solution/build/` (used after maker-UI edits, before `pac solution unpack`).

## Step 7 — Seed YAML structure + master-data extraction

**YAML directory layout:**

```
solution/seed/
├── option_sets/                # One file per global option set, mostly authored once
│   ├── reservation_status.yaml
│   └── ... (one per option set from Step 2)
├── reference/
│   ├── business.yaml
│   ├── asset.yaml
│   ├── unit.yaml
│   ├── domain.yaml
│   ├── system.yaml
│   ├── kind.yaml
│   ├── record_type.yaml
│   ├── record_phase.yaml
│   ├── vendor.yaml
│   ├── approved_bb_aa.yaml
│   ├── asset_unit.yaml
│   └── system_scope.yaml
├── app_config.yaml             # App Configuration defaults (see Step 9)
└── number_sequences.yaml       # Optional initial seeds for known sequences
```

**YAML row shape (reference tables):**

```yaml
# solution/seed/reference/business.yaml
table: enmax_autocadbusiness
natural_key_columns: [code] # used for deterministic_id(table, natural_key)
rows:
  - code: GG
    display_name: Generation
    description: ENMAX Generation business unit
    status: Active
    sort_order: 10
  - code: GW
    display_name: Generation (Wind)
    description: Wind generation subsidiary
    status: Active
    sort_order: 20
```

**YAML row shape (junction tables):**

```yaml
# solution/seed/reference/approved_bb_aa.yaml
table: enmax_autocadbusinessasset
natural_key_columns: [business_code, asset_code]
lookups:
  business:
    { table: enmax_autocadbusiness, key: code, source_column: business_code }
  asset: { table: enmax_autocadasset, key: code, source_column: asset_code }
rows:
  - business_code: GG
    asset_code: CG
  - business_code: GG
    asset_code: GN
```

**`solution/scripts/extract_master_data.py`** — reads `_assets/master-data/Master data.xlsx`, emits per-table YAML into `solution/seed/reference/`. Applies the five transformations from PRD section 22 verbatim:

1. Code / display-name parsing on first `-` substring
2. Character substitution (`<` → `under`, `>` → `over`) for System and Shepard columns; explicit mapping for six codes (EHA, ELA, ELB, ELC, EMB, EMC)
3. Encoding cleanup (`¿` → `–` en dash)
4. De-duplication on Code column
5. `XXX` / `XX` sentinel preservation as Active rows with `DisplayName = Unspecified`

Output is idempotent: re-running against the same workbook produces identical YAML.

## Step 8 — Seed loader (`seed.py`)

Replaces the plan #01 skeleton. Reads every YAML file in `solution/seed/`, computes deterministic GUIDs via `deterministic_id(table, natural_key)` (already defined in skeleton), upserts to Dataverse via Web API.

**Key implementation details:**

- **Auth:** MSAL confidential-client flow using `DATAVERSE_CLIENT_ID`, `DATAVERSE_CLIENT_SECRET`, `DATAVERSE_TENANT_ID`, `DATAVERSE_URL` env vars (already wired in `cd-dev.yml` from plan #01).
- **Lookup resolution:** For YAML rows with `lookups:`, resolve the FK by computing the parent row's deterministic GUID (using the parent's natural-key columns). Fail fast if the parent YAML hasn't been loaded yet — enforced by topological sort of YAML files by lookup dependency.
- **Option-set value lookup:** Where a YAML field is a string like `Active`, the loader translates it to the integer code by reading the option-set definition. The `0 = None` row must exist on every option set (fail-fast assertion per PRD section 22).
- **Upsert via Dataverse Web API:** `PATCH /api/data/v9.2/<entityset>(<id>)` with `If-Match: *` (insert-or-update by id).
- **Idempotency:** every run produces the same set of rows with the same GUIDs; re-runs are no-ops on unchanged YAML and apply edits to changed columns only.
- **Topological order:**
  1. Option sets first (validated, not written — sets are defined in the solution, not as data)
  2. Reference tables in dependency order: Business → Asset → Unit → Domain → System → Kind → Record Type → Record Phase → Vendor → Approved BB-AA → Asset-Unit → System Scope
  3. App Configuration (independent)
  4. Number Sequences (optional; only if `number_sequences.yaml` is non-empty)

**Validation passes (run before any write):**

- Every YAML row has all `natural_key_columns` populated
- Every FK in `lookups:` resolves to a deterministic ID of a row that exists in the parent YAML
- Every option-set-valued column resolves to a known label
- No duplicate natural keys within a single table

**Failure behaviour:**

- Validation failures: exit non-zero with a structured error report listing every offending row. Zero writes performed.
- Mid-run write failures: log the failed row and the error response, retry once with exponential back-off, then exit non-zero. Partial writes are not rolled back (Dataverse Web API does not support multi-row transactions for upserts at this scale; we accept that a failed run leaves the env partially seeded and re-running is safe because of deterministic GUIDs).

## Step 9 — App Configuration seed values

Per PRD section 13, with **two overrides from the decision memo applied**:

| Key                             | Default per PRD                                         | Seeded value                                                  | Notes                             |
| ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------- |
| `SingleAdminMode`               | false                                                   | false                                                         |                                   |
| `MaxDrawingsPerReservation`     | 10                                                      | 10                                                            |                                   |
| `MaxSheetsPerDrawing`           | 50                                                      | 50                                                            |                                   |
| `DefaultSheetsPerDrawing`       | 1                                                       | 1                                                             |                                   |
| `StaleCheckoutMonths`           | `3,6,12`                                                | `3,6,12`                                                      |                                   |
| `ApproverTeamName`              | `team-enmax-autocad-approvers`                          | `team-enmax-autocad-approvers`                                |                                   |
| `AdminTeamName`                 | `team-enmax-autocad-admins`                             | `team-enmax-autocad-admins`                                   |                                   |
| `SharedMailboxAddress`          | `gen-drawings@enmax.com`                                | **environment-specific** (see below)                          | **OVERRIDE per decision memo Q5** |
| `SharePointSiteUrl`             | `https://enmax.sharepoint.com/sites/GenerationDrawings` | same                                                          |                                   |
| `BusinessUnitName`              | `Enmax AutoCAD`                                         | same                                                          |                                   |
| `BrandPrimary`                  | `#E1393E`                                               | same                                                          | Cinnabar                          |
| `BrandSecondary`                | `#0F487A`                                               | same                                                          | Chathams Blue                     |
| `BrandAccent`                   | `#F7DB9C`                                               | same                                                          | Marzipan                          |
| `DefaultTheme`                  | `system`                                                | same                                                          |                                   |
| `EnableTelemetry`               | true                                                    | true                                                          |                                   |
| `MaintenanceBannerTitle`        | (PRD copy)                                              | same                                                          |                                   |
| `MaintenanceBannerBody`         | (PRD copy, must NOT invite reply per Q5 override)       | (PRD copy) — no change needed; existing copy is reply-neutral |                                   |
| `MaintenanceBannerSeverity`     | `Warning`                                               | `Warning`                                                     |                                   |
| `FooterDisclaimer`              | (PRD copy)                                              | same                                                          |                                   |
| `FooterCopyright`               | (PRD copy)                                              | same                                                          |                                   |
| `BroadcastFanOutCadenceMinutes` | 60                                                      | 60                                                            |                                   |

**Environment-specific `SharedMailboxAddress` (Q5 override):**

The YAML file holds the production / UAT default; CD workflows override per-environment via an env var consumed by `seed.py`:

```yaml
# solution/seed/app_config.yaml
table: enmax_autocadappconfig
natural_key_columns: [key]
rows:
  - key: SharedMailboxAddress
    value: "{{ APP_CONFIG_SHARED_MAILBOX | default('noreply-autocad@enmax.com') }}"
    value_type: String
    description: Outbound mailbox for Power Automate flows. Service account has Send As on this mailbox. NO-REPLY pattern — email copy must not invite replies.
  # ... other rows
```

The seed loader resolves `{{ ... }}` placeholders against environment variables at load time. CI workflows set:

| Workflow                    | `APP_CONFIG_SHARED_MAILBOX`                       |
| --------------------------- | ------------------------------------------------- |
| `cd-dev.yml`                | `noreply-autocad@tqnonline.onmicrosoft.com`       |
| `cd-uat.yml`                | `noreply-autocad@enmax.com`                       |
| Local seed (no env var set) | `noreply-autocad@enmax.com` (default in template) |

**`noreply` semantics:** the deferred email-template task (plan #05) must include an explicit "Do not reply to this email — open the app to respond" line per the cut-line spec.

## Step 10 — Number Sequence seed strategy

`solution/seed/number_sequences.yaml` ships **empty by default** in the repo. Reasoning:

- Dev tenant should start with zero pre-issued sequences so concurrency tests can target fresh combinations.
- UAT tenant pre-seeds happen via the bulk-CSV import path (plan #02's loader still supports YAML seeding for ad-hoc cases, but the operational tool is the admin UI's CSV importer which writes audit events).
- Production legacy migration is a runbook activity — admins seed real values from the legacy SQL Server roster, not from version-controlled YAML.

The schema and the loader path are built and tested; the actual seed content is empty until ops needs it.

## Verification — End-to-End Checklist

Run from repo root in PowerShell 7+ after schema authoring + script implementation complete:

```powershell
# Build + import
python solution/scripts/pack.py
$env:DATAVERSE_URL = "https://<dev-org>.crm3.dynamics.com"
$env:DATAVERSE_CLIENT_ID = "<service-principal-client-id>"
$env:DATAVERSE_CLIENT_SECRET = "<from-key-vault>"
$env:DATAVERSE_TENANT_ID = "<tenant-id>"
python solution/scripts/import.py

# Extract master data + seed
python solution/scripts/extract_master_data.py
python solution/scripts/seed.py

# Verify in maker UI
# - Solution imports without errors
# - All ~22 tables visible under EnmaxAutoCADNumbering solution
# - Reference tables populated with master-data values
# - App Configuration table has all 21 rows from Step 9 (with override applied)
# - Number Sequence table is empty
# - All transactional tables exist but are empty
# - Every option set has a 0=None row

# Idempotency check
python solution/scripts/seed.py    # Second run; should be a no-op (zero PATCH calls for unchanged rows)

# Cross-environment determinism check (smoke)
# After authoring is done, import the same solution + run seed against a second clean env.
# Compare row GUIDs between dev and second env: must be byte-identical.
```

**Acceptance:** PR `feat(schema): dataverse schema + deterministic seed per plan #02` is green, reviewed by one human, and squash-merged into `dev`. `cd-dev.yml` runs to completion against an actual dev tenant (not just CI dry-run).

## Critical Files to Read Before Starting

| File                                                                                    | Why                                                |
| --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `.worktrees/specs/docs/superpowers/specs/PRD-and-Architecture.md` sections 7, 9, 13, 22 | Authoritative schema source                        |
| `.worktrees/specs/docs/superpowers/specs/2026-05-17-phase-1-cut-line-spec.md`           | Scope boundary                                     |
| `.worktrees/specs/docs/superpowers/specs/2026-05-17-open-questions-decision-memo.md`    | Q5 mailbox override applied in Step 9              |
| `_assets/master-data/Master data.xlsx` (in specs worktree)                              | Source workbook for `extract_master_data.py`       |
| `_assets/master-data/Numbering Coding Identifiers.docx` (Attachments 1+2)               | Source for Asset-Unit and Approved BB-AA junctions |

## Downstream Plans Unblocked by This Plan

| Plan                                           | Unblocked? | Why                                                                                                                                                             |
| ---------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #03 IssueNumbers plug-in                       | Yes        | Number Sequence table + Sequence Key alternate key exist for plug-in to lock and update.                                                                        |
| #04 Code App shell                             | Partial    | App Configuration table exists for client to read at startup. Reference tables exist for cascading dropdowns. Transactional tables exist for React Query hooks. |
| #05 Reservation flow + 3-channel notifications | Yes        | Reservation, Drawing, Sheet, In-App Notification tables exist. Flows can mutate them.                                                                           |
| #06 Check-Out/Check-In + revision              | Yes        | Checkout table + Drawing state machine in place. SharePoint URL columns on Drawing and Sheet exist (populated by SharePoint provisioning flow in #06).          |
| #07 Search + admin surfaces                    | Yes        | All grids backed by these tables.                                                                                                                               |
| #08 Broadcast + notifications                  | Yes        | Broadcast, Broadcast Dismissal, In-App Notification tables exist.                                                                                               |
| #09 UAT promotion                              | No         | Blocked on full feature set; this plan only unblocks the schema portion of UAT readiness.                                                                       |

## Risks + Mitigations

| Risk                                                                                       | Mitigation                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Maker UI authoring introduces drift between dev environment and committed XML              | Discipline: every change ends with export → unpack → commit before the working session closes. PR description must include a screenshot of the maker schema or an `pac solution check` report.                                                                                                                       |
| `pac solution import` rejects the packed solution due to XML hand-edits                    | Avoid hand-edits where possible. When unavoidable, run `pac solution check` before commit and against the dev env after import.                                                                                                                                                                                      |
| Option-set value codes shift if option sets are recreated rather than edited               | Always edit existing option sets in maker, never delete and recreate. Code app and flows reference values by integer code; recreation reassigns codes and silently breaks all consumers. Add explicit value codes (Step 2 table) to the option-set definitions in maker UI rather than letting platform assign them. |
| Lookup column rename breaks the seed loader's natural-key resolution                       | Schema name is immutable in maker; display name changes do not affect schema. Loader uses schema names, not display names.                                                                                                                                                                                           |
| Junction table seed order race (e.g. Approved BB-AA loaded before both Business and Asset) | Topological sort in seed loader explicitly orders YAML files. Validation pass surfaces missing parents before any write.                                                                                                                                                                                             |
| Master-data workbook updated after extract script ships, breaking extraction               | Pin the workbook's git hash in `extract_master_data.py` output (writes a `.checksum` next to the YAML); CI fails if the workbook changes without a corresponding extraction re-run.                                                                                                                                  |
| Service account loses System Customizer role between schema import attempts                | Runbook #001 documents the role grant. `import.py` surfaces the specific 403 error to make the diagnosis fast.                                                                                                                                                                                                       |
| Concurrency-test combination collides with a real seeded sequence                          | Tests target a dedicated `ZZ-ZZ-ZZ-ZZZ-ZZZ-ZZ` combination that is explicitly seeded inactive for production safety but available in dev. Documented in plan #03.                                                                                                                                                    |

## TODOs Left in This Plan

- **Master-data workbook canonical version:** ENMAX-supplied workbook hash to be captured during first extract run; `.checksum` mechanism implementation defined here, populated at execution time.
- **`pac solution check` integration in CI:** add as a step in `cd-dev.yml` post-import, surfacing schema-quality warnings. Defer to plan #02 follow-up if PAC CLI exit code on warnings is too noisy.
- **Number Sequence legacy-roster CSV format:** plan #02 builds the import path; legacy roster CSV column mapping is defined in runbook #010 (UAT deployment) when ops has the legacy SQL extract.
