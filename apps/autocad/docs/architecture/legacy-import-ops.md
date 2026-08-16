# Legacy import & numbering ops — architecture guide

Maintainer guide for humans and agents. Companion runbook: [`solution/scripts/OPS_LEGACY_IMPORT.md`](../solution/scripts/OPS_LEGACY_IMPORT.md).  
Numbering contract: [ADR 0001](adr/0001-document-numbering-model.md). Issuance is **never** client-side (CLAUDE.md Rule 14).

## Why this exists

Generation (GF) and EEC coded PDFs are bulk-loaded into Dataverse with high-water `enmax_acdnlastissued` counters so new reservations continue after import instead of restarting at `0001`. Operators must be able to purge, import, prove numbering, and brief Heather without tribal knowledge.

---

## C4 — System context (L1)

```mermaid
C4Context
    title System context — ENMAX AutoCAD numbering & legacy import

    Person(sre, "SRE / Platform", "Runs purge, import, validate CLIs")
    Person(heather, "Document control (Heather)", "Owns coding rules & import reports")
    Person(user, "Engineer / Approver", "Reserves & approves numbers in Code App")

    System(codeapp, "ENMAX AutoCAD Code App", "Reserve, search, approve, checkout")
    System_Ext(dv, "Dataverse", "Reservations, drawings, sheets, sequences, Custom APIs")
    System_Ext(sp, "SharePoint", "PDF drop-off / destination libraries")
    System_Ext(excel, "GF/EEC Excel extracts", "Legacy coded PDF inventories")

    Rel(user, codeapp, "Uses")
    Rel(codeapp, dv, "OData + Custom APIs")
    Rel(codeapp, sp, "PDF URLs / upload targets")
    Rel(sre, excel, "Reads extracts")
    Rel(sre, dv, "Web API via Python CLIs")
    Rel(sre, heather, "Delivers Excel reports")
    Rel(heather, excel, "Defines filename & taxonomy rules")
```

---

## C4 — Containers (L2)

```mermaid
C4Container
    title Containers — import / purge / validate toolchain

    Person(sre, "SRE")

    Container_Boundary(scripts, "solution/scripts") {
        Container(parse, "legacy_coded_pdf_parse", "Python", "Heather classify, dedupe, sequence seeds")
        Container(report, "legacy_coded_pdf_report", "Python", "Heather multi-sheet Excel")
        Container(importcli, "import_legacy_coded_pdfs", "Python", "Orchestrate apply + checkpoints")
        Container(upsert, "dv_upsert_batch", "Python", "UpsertMultiple + contiguous resume")
        Container(common, "dv_cli_common", "Python", "Host gates, TokenHolder, headers, log_event")
        Container(purge, "purge_transaction_data", "Python", "BulkDelete / row delete")
        Container(validate, "validate_imported_numbering", "Python", "One reservation per type")
        Container(runbook, "OPS_LEGACY_IMPORT.md", "Markdown", "Operator procedure")
    }

    Container(codeapp, "Code App", "React", "Approve → IssueNumbers / AddChildItems")
    System_Ext(dv, "Dataverse")
    System_Ext(xlsx, "Source Excel")

    Rel(sre, importcli, "CLI")
    Rel(sre, purge, "CLI")
    Rel(sre, validate, "CLI")
    Rel(importcli, parse, "parse_excel_stream")
    Rel(importcli, upsert, "upsert_targets_chunked")
    Rel(importcli, report, "write_heather_workbook")
    Rel(importcli, common, "gates / token")
    Rel(purge, common, "gates / token")
    Rel(validate, common, "gates / token")
    Rel(upsert, dv, "UpsertMultiple / PATCH")
    Rel(purge, dv, "BulkDelete")
    Rel(validate, dv, "Approve + IssueNumbers + AddChildItems")
    Rel(codeapp, dv, "Same Custom APIs")
    Rel(parse, xlsx, "Read")
```

---

## C4 — Components (L3) — import apply path

```mermaid
C4Component
    title Components — import apply_result

    Container_Boundary(imp, "import_legacy_coded_pdfs") {
        Component(cli, "main / run_stream", "Argparse, host confirm, report paths")
        Component(apply, "apply_result", "Parents → bases → sheets → sequences")
        Component(builders, "build_*_target", "Deterministic GUIDs + payloads")
        Component(seeds, "sequence_seeds_from_rows", "Limit-safe high-water map")
        Component(merge, "load_live_sequence_lastissued", "Max-merge with live counters")
    }

    Container_Boundary(batch, "dv_upsert_batch") {
        Component(chunked, "upsert_targets_chunked", "Probe, split, parallel, checkpoint")
        Component(classify, "classify_upsert_multiple_response", "ok/unsupported/retry/split/fail")
        Component(ck, "contiguous_checkpoint", "Resume-safe prefix")
    }

    Rel(cli, apply, "apply=true")
    Rel(apply, builders, "Build targets")
    Rel(apply, seeds, "When --limit set")
    Rel(apply, merge, "Before sequence upsert")
    Rel(apply, chunked, "Per phase")
    Rel(chunked, classify, "HTTP status/body")
    Rel(chunked, ck, "Advance checkpoint")
```

---

## Process — operator happy path

```mermaid
flowchart TD
    A[Start Dev reset] --> B{Need empty transactions?}
    B -->|Yes| C[purge_transaction_data --confirm-dev]
    B -->|No| E[Import]
    C --> D{exit 0 and tables empty?}
    D -->|No| X[Stop — investigate BulkDelete]
    D -->|Yes| E[import_legacy_coded_pdfs --apply --confirm-dev]
    E --> F{exit 0?}
    F -->|No| G[Fix errors — resume with --resume]
    G --> E
    F -->|Yes| H[validate_imported_numbering --confirm-dev]
    H --> I{All PASS?}
    I -->|No| X
    I -->|Yes| J[Search spot-check + Heather summary]
    J --> K[Done]
```

---

## Process — numbering families (ADR 0001)

```mermaid
flowchart LR
    subgraph Shared["Shared counter family"]
      DD[Drawing Document]
      DR[Drawing]
    end
    subgraph Separate["Separate families"]
      ST[Standard STD]
      PR[Procedure PRC]
      FR[Form FRM]
    end
    DD --> DRW["coding|DRW"]
    DR --> DRW
    ST --> STD["coding|STD"]
    PR --> PRC["coding|PRC"]
    FR --> FRM["coding|FRM"]
    FRM --> APP["Existing only: AddChildItems -SSS"]
    DRW --> ISS["IssueNumbers → lastissued+N"]
    STD --> ISS
    PRC --> ISS
```

---

## Sequence — validate one type (New)

```mermaid
sequenceDiagram
    participant CLI as validate_imported_numbering
    participant DV as Dataverse
    participant P1 as ApproveReservation plugin
    participant P2 as IssueNumbers plugin

    CLI->>DV: Create reservation (Pending)
    CLI->>DV: enmax_acdnApproveReservation
    DV->>P1: Status → Approved
    CLI->>DV: enmax_acdnIssueNumbers (Reservation + composition)
    DV->>P2: Lock sequence row, bump lastissued
    P2-->>CLI: IssuedNumbers, NewLastIssued
    CLI->>DV: Assert lastissued and reservation issued numbers
```

Form Existing uses `enmax_acdnAddChildItems` instead of IssueNumbers; NNNN unchanged, `-SSS` advances.

---

## Sequence — import resume safety

```mermaid
sequenceDiagram
    participant W1 as Worker chunk @1500
    participant W2 as Worker chunk @1000
    participant CK as Checkpoint file

    Note over W1,CK: Contiguous prefix only
    W1-->>CK: Completes first — prefix stays at prior end
    W2-->>CK: Completes — prefix advances through 1000 then 1500
    Note over CK: Crash mid-flight: resume skips only completed prefix
```

---

## Data — entities touched

| Entity | Import | Purge | Validate |
|--------|--------|-------|----------|
| `enmax_autocaddrawing` | upsert bases/parents | delete | read Form base |
| `enmax_autocadsheet` | upsert sheets | delete | assert SSS |
| `enmax_autocadnumbersequence` | max-merge upsert | delete | assert lastissued |
| `enmax_autocadreservation` | — | delete | create/approve |
| Reference (Business…Kind) | read-only | **never** | read |

---

## Failure modes (SRE cheat sheet)

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Import exit 1, Heather GUIDs missing for a phase | Phase upsert errors | Fix API/auth; `--resume` |
| Numbers collide after smoke `--limit` | Old bug; fixed — seeds from applied rows | Re-import sequences with max-merge |
| Drawing NNNN restarts below history after import-without-purge | Pre-partition `coding` row ignored when seeding `coding\|DRW` | Fixed via `max_merge_sequence_seed`; still prefer purge-then-import |
| Purge “success” but rows remain | Sandbox BulkDelete | Re-run **without** `--sandbox` |
| 401 storms mid-run | Token refresh failed | Script should abort; re-auth `az login` |
| Form SSS wrong | AddChildItems not used | Validate must call AddChildItems for Existing Form |

---

## Agent notes

- Prefer editing `legacy_coded_pdf_parse.py` for Heather classify rules; do not put taxonomy in HTTP layer.
- Prefer `dv_upsert_batch.py` for concurrency/checkpoint changes.
- Prefer `dv_cli_common.py` for any new CLI that writes to Dataverse.
- Never invent next numbers in TypeScript — call Custom APIs.
- Reports under `solution/scripts/reports/` are gitignored — do not force-add.

---

## Search UI note

Search lists **Drawings** and **Documents** only. Reservation triage stays on Approvals / My Items. Shared `DocumentTypeBadge` maps Heather subtypes for display. This removal is intentional product cleanup from the thermos-approved Search simplification.

## Module map (quick)

| Module | Own when changing… |
|--------|--------------------|
| `legacy_coded_pdf_parse.py` | Filename rules, GF/EEC classify, dedupe |
| `legacy_coded_pdf_report.py` | Heather Excel sheets / email draft |
| `import_legacy_coded_pdfs.py` | CLI, apply orchestration, sequence max-merge |
| `dv_upsert_batch.py` | UpsertMultiple, resume checkpoints, workers |
| `dv_cli_common.py` | Host gates, tokens, `ENMAX_OPS_LOG=json` |
| `purge_transaction_data.py` | BulkDelete / row purge policy |
| `validate_imported_numbering.py` | Post-import numbering proof |
| `OPS_LEGACY_IMPORT.md` | Operator steps |
