# ADR 0001 - EEC Generation document numbering model

- Status: Accepted (amended 2026-08-04 — type-partitioned NNNN)
- Date: 2026-07-06
- Plan: `specs` branch `docs/superpowers/plans/2026-07-06-plan-14-eec-generation-doc-management.md`
- Supersedes/aligns: plans 01-13 (numbering was Drawing-only)
- Amendment: decision §3 reversed from type-agnostic shared sequence to type-partitioned counters (`coding|FAMILY`); drawing AK is composite (number + documentsubtype). See `solution/scripts/migrate_type_partitioned_number_ak.py`.

## Context

The system was built to reserve and issue **Drawing** numbers only. The business now needs the same controlled-numbering and document-management capability for **Standards**, **Procedures**, and **Forms**, and a broader set of workflow and repository changes (see plan-14). The current implementation hard-codes drawing-specific assumptions in several places:

- Issuance composes a 6-segment key `BB-AA-UU-DDD-SSS-KK` and issues a 4-digit `nnnn` ([IssueNumbersPlugin.cs](../../solution/plugins/IssueNumbers/IssueNumbersPlugin.cs)); the full number string and child `-sss` suffix are formatted in `AutoCreateDrawingsPlugin` / `CreateDrawingsPlugin`.
- The reservation wizard forces `recordType = "Drawing"`, and the six segment dropdowns cascade with combination checks.
- A second, divergent issuance path exists in the `On_Reservation_Approved_Issue_Drawings` Cloud Flow.
- "Sheet" terminology is drawing-specific.

`CLAUDE.md` **Rule 14** (concurrency-safe issuance) and **Rule 15** (Code Apps read the App Configuration table, not env vars) constrain the design.

## Decision

1. **Taxonomy.** A reservation has a **Type** (`Drawing` | `Document`); a `Document` has a **Subtype** (`Standard` | `Procedure` | `Form`).
   - `Drawing` / `Drawing Document` -> base `BB-AA-UU-DDD-SSS-KK-nnnn`; Drawing Document is base-only PDF; Drawing may have 1..N **Drawing documents** (`-sss`).
   - `Document/Standard` -> base only (a single Standard Document; no children).
   - `Document/Procedure` -> base Procedure number; when forms/sheets ≥ 1, issuance also creates Form children (`-sss`) stamped as subtype Form (5). A Procedure with zero forms is base-only.
   - `Document/Form` -> Existing-only append of 1..N **Forms** (`-sss`) onto an existing Form (or Procedure-hosted Form) base. Historical Procedure-with-forms records migrate to Form where appropriate.
2. **Number format.** Base = `BB-AA-UU-DDD-SSS-KK-nnnn` (`nnnn` = 4 digits, 1..9999). Child = base + `-sss` (`sss` = 3 digits, hard cap 999, default 1). "Sheet" is retired as a user-facing label.
3. **Base sequence is type-partitioned per coding.** For a given 6-segment coding, `nnnn` is independent per numbering family — Drawing (`DRW`, shared by Drawing Document + Drawing), Standard (`STD`), Procedure (`PRC`), Form (`FRM`). Counter rows in `enmax_autocadnumbersequence` use key `{coding}|{FAMILY}`; displayed `SequenceKey` / `enmax_acdnnumber` remain `{coding}-{nnnn}` (no family token in the user-facing number). The drawing alternate key is composite (`enmax_acdnnumber` + `enmax_acdndocumentsubtype`) so the same coding+NNNN may exist across families. Legacy Drawing counters (coding-only keys) are dual-read and renamed to `coding|DRW` on first Drawing issuance after cutover.
4. **No combination constraints.** The six dropdowns are independent - all active values, no cascade, no Approved BB-AA / Asset-Unit / System-scope checks. The Approved BB-AA (`enmax_autocadbusinessasset`) and Asset-Unit (`enmax_autocadassetunit`) combination tables are **removed from the solution schema** (2026-07-08); existing environments must run `migrate_drop_combination_tables.py` before solution import. `enmax_autocadsystemscope` is retained as an empty optional admin surface.
5. **Single issuance path.** The Dataverse custom action + plug-in (`enmax_acdnIssueNumbers`) is the sole authoritative issuer, preserving the optimistic-lock concurrency guard and the mandatory N-parallel-calls -> N-distinct-numbers test (**Rule 14**). The legacy `On_Reservation_Approved_Issue_Drawings` Cloud Flow is retired/aligned.
6. **Keep Dataverse schema names; relabel displays.** `enmax_autocadsheet` / `enmax_autocadreservation` schema names are unchanged (renaming would break relationships, forms, generated services, plugins). Display names follow Heather's controlled-numbering vocabulary:

   | Pattern | Drawing | Standard Document | Procedure | Form |
   |---------|---------|-------------------|-----------|------|
   | `BB-AA-UU-DDD-SSS-KK` | Drawing/Document **Numbering group** | Numbering group | Numbering group | Numbering group |
   | `BB-AA-UU-DDD-SSS-KK-NNNN` | **Drawing Number** | **Standard Document** | **Procedure** | Form (base) |
   | `BB-AA-UU-DDD-SSS-KK-NNNN to YYYY` | **Drawing Number range** | — | **Procedure range** | **Form Number range** |
   | `BB-AA-UU-DDD-SSS-KK-NNNN-SSS` | **Drawing document** | — | **Form** (child of Procedure when forms ≥ 1) | **Form** |

   Entity display names: `enmax_autocadreservation` = "Drawing/Document Reservation"; `enmax_autocaddrawing` (base item) = "Drawing Number / Standard Document / Procedure / Form"; `enmax_autocadsheet` (child item) = "Drawing document / Form". The `enmax_autocaddrawing` table is the base container for a Drawing Number, a Standard Document, a Procedure, **or** a Form base; `enmax_autocadsheet` is the child container for Drawing documents and Forms. Client terminology is centralized in `code-app/src/features/reserve/numberingTerms.ts`. No separate Document/Procedure/Form tables are introduced.
7. **Gated Check Out + Check In submission info.** Check Out requires approval before the drop-off working window opens; Check In captures mandatory Submission Information and drops the revision number (SharePoint version history is the revision trail).
8. **SharePoint + config.** Two pre-existing sites (Drawings; Documents), each with a read/write drop-off and a read-only destination library; records carry a drop-off and a destination link; library base URLs and UI flags live in the **App Configuration table** (**Rule 15**). Indexed PDF filenames follow Heather numbering: **Standard Document** / **Procedure** `BB-AA-UU-DDD-SSS-KK-NNNN.pdf` on the base drawing record; **Drawing document** / **Form** `BB-AA-UU-DDD-SSS-KK-NNNN-SSS.pdf` on the child sheet record. Drawing Number bases (without `-SSS`) do not carry file links. Client resolution prefers the **destination** link except while an item is awaiting check-in validation (drop-off). See `code-app/src/features/sharepoint/sharepointUrls.ts`.
9. **Denormalize Type/Subtype onto issued records.** `enmax_acdnreservationtype` and `enmax_acdndocumentsubtype` (both referencing the shared global option sets `enmax_acdn_reservationtype` / `enmax_acdn_documentsubtype`) are copied onto `enmax_autocaddrawing` **and** `enmax_autocadsheet` by the issuance plug-ins (`CreateDrawingsPlugin`, `AutoCreateDrawingsPlugin`) at creation time. Rationale: a base/child record is then self-identifying in standalone surfaces (Search, Checkout) without a join back to its reservation. Because records are immutable after issuance there is no update-sync obligation; legacy/null values continue to read as Drawing.
10. **Add-to-existing goes through reservation approval.** Appending child items (`-sss`) to an already-issued base number is submitted as a reservation, routed through the same approval workflow as new-number reservations, and issued on approval. The reservation carries `enmax_acdntargetdrawing` (lookup to the base `enmax_autocaddrawing`) plus optional `enmax_acdnappendfirst` / `enmax_acdnappendlast` (the issued child-index range). `AutoCreateDrawingsPlugin` skips when `enmax_acdntargetdrawing` is set — append reservations do not create new base drawings. The direct `enmax_acdnAddChildItems` Custom API remains for approver/admin use outside the approval path.

## Consequences

- One numbering engine serves all document types; new types are additive (scheme + reference data), not code forks.
- The change is landed **safety-net first**: golden/characterization tests pin current Drawing output (plugin format + client preview) before any refactor; schema changes are additive; behavior sits behind App Config flags; the concurrency test remains the merge gate.
- Removing combination validation (and later dropping the combination tables) trades data-quality guardrails for flexibility; a Phase 3 anomaly report is the compensating control for unstructured segment mixes.
- Retiring the Cloud Flow removes a divergent issuance path (less drift, one place to test).

## Alternatives considered

- **Type-agnostic shared sequence** (one `nnnn` per coding across all types): rejected after cutover — Procedures were continuing Drawing counters (e.g. Drawing used 0001–0006, Procedure started at 0007). Business requires NNNN uniqueness *within* each parent type (Drawing / Standard / Procedure), not across them.
- **Generalized config-driven scheme engine** (arbitrary per-type segment definitions): deferred - more power than the four known types need today; revisit if a new format cannot be expressed by the current base + `-sss` model.
- **Issuance via Power Automate** (fully low-code): rejected by **Rule 14** - a non-transactional flow cannot guarantee unique numbers under concurrency.
