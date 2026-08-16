# Ops runbook — legacy PDF import, purge, numbering proof

Audience: SRE / platform engineer resetting **Development** (`nrg-enmax-dev.crm3.dynamics.com`) and proving numbering continues after import.

Related: ADR 0001 (numbering), CLAUDE.md Rule 14 (Custom API issuance only), `docs/architecture/legacy-import-ops.md` (C4 + diagrams).

## When to use

| Situation | Use this? |
|-----------|-----------|
| Dev/UAT org wipe + re-import GF/EEC coded PDFs | Yes |
| Prod cutover | **No** — separate change window; purge needs `--confirm-prod-emergency` + `--job-name` |
| Day-to-day reservation testing | No — use Code App / `seed_uat_acceptance.py` |

UAT and Dev share the same Dataverse host.

## Prereqs

```bash
export DATAVERSE_URL=https://nrg-enmax-dev.crm3.dynamics.com
az login   # or DATAVERSE_ACCESS_TOKEN
cd solution/scripts
# Python env with requirements (openpyxl, requests, msal, …)
```

- Explicit Excel paths: `--gf-excel` / `--eec-excel` (no machine-local defaults).
- Validate needs a user token in **Approver** or **Admin** team.
- Optional scrapeable logs: `export ENMAX_OPS_LOG=json`
- **Type-partitioned drawing AK:** after deploying the composite number+subtype alternate key, run `migrate_type_partitioned_number_ak.py --confirm-dev` (Dev-only; dry-run allowed anywhere) if the old number-only AK may still exist (see ADR 0001 amendment). Do this **before** large imports.

## Order of operations

```text
1. (Optional) Purge transaction tables
2. Import GF + EEC (--apply --confirm-dev)
3. validate_imported_numbering.py
4. Search spot-check in Code App
5. Heather Excel / summary for stakeholders
```

### 1. Purge (optional reset)

```bash
python purge_transaction_data.py --auth azcli --dry-run
python purge_transaction_data.py --auth azcli --confirm-dev          # BulkDelete default
# python purge_transaction_data.py --auth azcli --confirm-dev --mode row --workers 20
```

**Green:** exit `0`; every purge table empty.  
**Red:** exit `1` — do not import. Never use `--sandbox` for real wipes (can report success without deleting).

### 2. Import

```bash
python import_legacy_coded_pdfs.py --stream all --apply --auth azcli --confirm-dev \
  --gf-excel "$GF_XLSX" --eec-excel "$EEC_XLSX" \
  --batch-scale 2 --workers 2 \
  --report-dir reports/legacy_import_clean_dev
```

Resume after interrupt:

```bash
python import_legacy_coded_pdfs.py ... --resume --report-dir reports/legacy_import_clean_dev
```

**Flags that matter**

| Flag | Meaning |
|------|---------|
| `--confirm-dev` | Required for apply on Dev host |
| `--batch-scale` | `1`…`4` × 500 rows per UpsertMultiple chunk |
| `--workers` | Parallel chunks; checkpoint is **contiguous prefix** (safe with resume) |
| `--resume` | Skip completed prefix from `checkpoint_{stream}_{env}.json` |
| `--limit N` | Smoke only — sequences derived from applied rows only |
| `--legacy-row-upsert` | Debug PATCH-per-row |

**Green:** exit `0`; Heather report `applied` IDs only for successful phases.  
**Red:** exit `1` — do not trust GUID columns for failed phases; fix and `--resume` or re-purge.

Sequence seeds **max-merge** with live `lastissued` (never lower a counter). For Drawing (`coding|DRW`), merge also considers the pre-partition legacy key `coding` so a partial import without sequence purge cannot restart NNNN below the historical high-water. Prefer purge-then-import on Dev.

### 3. Numbering proof

```bash
python validate_imported_numbering.py --auth azcli --confirm-dev
```

Creates one reservation per taxonomy type → Approve → IssueNumbers / AddChildItems.  
**Green:** all `PASS`. Leaves approved test reservations in Dev (purge later if needed).

### 4. Search spot-check

In the Code App Search: open a known GF drawing and an EEC Standard/Procedure/Form; confirm PDF URL and type badge. Reservations are **not** on the Search tabs (use Approvals / My Items).

### 5. Stakeholder report

Heather workbooks land under `--report-dir` (gitignored). Open the workbook’s **Summary** sheet (and **Email Draft** sheet) for a non-technical briefing — there is no separate CLI “Numbering Summary” file from this pipeline.

## Resume rules

- Checkpoint value = completed **prefix** length for that phase — not a sum of out-of-order chunk successes.
- Do not hand-edit checkpoint JSON.
- After failed phase, re-run with `--resume`; do not lower sequences manually.

## Cleanup

Validation reservations remain until the next transaction purge. Safe on Dev.

## SharePoint DropOff casing

`solution/seed/app_config.dev.yaml` uses `EECDocumentControl/DropoffLibrary` (lowercase **off**) vs GEN-POC `DropOffLibrary`. Before blaming upload/index bugs, confirm the live library URL character-for-character in SharePoint admin / browser address bar and align App Config if needed.

## Search product note

Search no longer has a Reservations tab (use Approvals / My Items). Drawing/Document search + `DocumentTypeBadge` remain.
