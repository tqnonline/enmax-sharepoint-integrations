# ADR 0001 - EEC Generation document numbering model

- Status: Accepted
- Date: 2026-07-06
- Plan: `specs` branch `docs/superpowers/plans/2026-07-06-plan-14-eec-generation-doc-management.md`
- Supersedes/aligns: plans 01-13 (numbering was Drawing-only)

## Context

The system was built to reserve and issue **Drawing** numbers only. The business now needs the same controlled-numbering and document-management capability for **Standards**, **Procedures**, and **Procedure Forms**, and a broader set of workflow and repository changes (see plan-14). The current implementation hard-codes drawing-specific assumptions in several places:

- Issuance composes a 6-segment key `BB-AA-UU-DDD-SSS-KK` and issues a 4-digit `nnnn` ([IssueNumbersPlugin.cs](../../solution/plugins/IssueNumbers/IssueNumbersPlugin.cs)); the full number string and child `-sss` suffix are formatted in `AutoCreateDrawingsPlugin` / `CreateDrawingsPlugin`.
- The reservation wizard forces `recordType = "Drawing"`, and the six segment dropdowns cascade with combination checks.
- A second, divergent issuance path exists in the `On_Reservation_Approved_Issue_Drawings` Cloud Flow.
- "Sheet" terminology is drawing-specific.

`CLAUDE.md` **Rule 14** (concurrency-safe issuance) and **Rule 15** (Code Apps read the App Configuration table, not env vars) constrain the design.

## Decision

1. **Taxonomy.** A reservation has a **Type** (`Drawing` | `Document`); a `Document` has a **Subtype** (`Standard` | `Procedure`).
   - `Drawing` -> base `BB-AA-UU-DDD-SSS-KK-nnnn` with 1..N **Drawing Documents** (`-sss`).
   - `Document/Standard` -> base only (a single Standard Document; no children).
   - `Document/Procedure` -> base with 1..N **Procedure Form Documents** (`-sss`).
2. **Number format.** Base = `BB-AA-UU-DDD-SSS-KK-nnnn` (`nnnn` = 4 digits, 1..9999). Child = base + `-sss` (`sss` = 3 digits, hard cap 999, default 1). "Sheet" is retired as a user-facing label.
3. **Base sequence is type-agnostic per coding.** For a given 6-segment coding, `nnnn` is one shared sequence (existing `enmax_autocadnumbersequence`), so a base number belongs to exactly one reservation regardless of Type. No Type partition in the sequence key.
4. **No combination constraints.** The six dropdowns are independent - all active values, no cascade, no Approved BB-AA / Asset-Unit / System-scope checks. Combination tables are kept read-only for historical rows only.
5. **Single issuance path.** The Dataverse custom action + plug-in (`enmax_acdnIssueNumbers`) is the sole authoritative issuer, preserving the optimistic-lock concurrency guard and the mandatory N-parallel-calls -> N-distinct-numbers test (**Rule 14**). The legacy `On_Reservation_Approved_Issue_Drawings` Cloud Flow is retired/aligned.
6. **Keep Dataverse schema names; relabel displays.** `enmax_autocadsheet` / `enmax_autocadreservation` schema names are unchanged (renaming would break relationships, forms, generated services, plugins). Display names become "Drawing/Document Reservation" and the child label is derived from the parent Type ("Drawing Document" / "Procedure Form Document").
7. **Gated Check Out + Check In submission info.** Check Out requires approval before the drop-off working window opens; Check In captures mandatory Submission Information and drops the revision number (SharePoint version history is the revision trail).
8. **SharePoint + config.** Two pre-existing sites (Drawings; Documents), each with a read/write drop-off and a read-only destination library; records carry a drop-off and a destination link; library base URLs and UI flags live in the **App Configuration table** (**Rule 15**). Indexing/upload stay low-code (Power Automate + connectors + embedded SharePoint UI); the numbering plug-in is the one pro-code exception.

## Consequences

- One numbering engine serves all document types; new types are additive (scheme + reference data), not code forks.
- The change is landed **safety-net first**: golden/characterization tests pin current Drawing output (plugin format + client preview) before any refactor; schema changes are additive; behavior sits behind App Config flags; the concurrency test remains the merge gate.
- Removing combination validation trades data-quality guardrails for flexibility; a Phase 3 anomaly report is the compensating control.
- Retiring the Cloud Flow removes a divergent issuance path (less drift, one place to test).

## Alternatives considered

- **Type-partitioned sequences** (per-Type `nnnn`): rejected - the business treats a base number as "either a document or a drawing", so a shared per-coding sequence matches intent and keeps a base globally unique.
- **Generalized config-driven scheme engine** (arbitrary per-type segment definitions): deferred - more power than the four known types need today; revisit if a new format cannot be expressed by the current base + `-sss` model.
- **Issuance via Power Automate** (fully low-code): rejected by **Rule 14** - a non-transactional flow cannot guarantee unique numbers under concurrency.
