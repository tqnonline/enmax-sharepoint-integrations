# ADR 0004 - Unified file lifecycle

- Status: Accepted
- Date: 2026-07-10
- Amends: [ADR 0002](0002-per-document-checkout.md)
- Plan: Unified File Lifecycle

## Context

ADR 0002 made `enmax_autocadsheet` the per-document checkout unit, but the product still has drawing-oriented labels, legacy APIs, split approval operations, and ambiguous initial and publication states. The lifecycle needs one authoritative file identity, explicit concurrency and replay contracts, clear personal and approval surfaces, and a safe migration path.

## Decision

1. **Authoritative file model.** The physical `enmax_autocadsheet` row remains authoritative and is labeled **Document File** in user-facing surfaces. A Standard has exactly one suffix-less singleton file. `enmax_autocaddrawing` remains the numbering-group parent; its state is a derived rollup of its files.
2. **File state machine.** Existing state value `1` is relabeled **Allocated**. Non-terminal states are Allocated, Available, additive **Checkout Requested**, Checked Out, and Awaiting Validation; terminal states remain Obsolete, Void, and Finalized. Issuance and appended files start Allocated. Checkout may start from Allocated or Available. A declined checkout restores the file's recorded prior state. A check-in becomes Available only after approval and successful destination publication.
3. **Surfaces and authorization.** **My Reservations** and **My Items** are always scoped to the signed-in user. **Approvals** is a global action queue visible only to Approver, Admin, and System Administrator roles. Search relies on Dataverse row security; elevated roles may search organization-wide.
4. **Write guarantees and audit.** Every lifecycle write is atomic, idempotent by operation identifier, and guarded by expected row version. Audit events are keyed to the Document File and written in the same Dataverse transaction as the state change.
5. **SharePoint and notifications.** Power Automate is email-only and does not own lifecycle state. The Code App performs an advisory SharePoint check before check-in submission, but missing or unchanged content does not block submission. It blocks ordinary validation approval until destination publication is proven. File actions use exact-file deep links, and history is paged.
6. **Atomic continuation.** Approval of an add-to-existing Drawing or Procedure reservation is one atomic, idempotent command covering numbering and file creation. A Standard continuation issues a new base plus its singleton instead of creating children.
7. **Compatibility and contracts.** Legacy adapters remain until clients migrate. Versioned API contracts are frozen before handler implementation; changes are additive or explicitly versioned and are never made silently. Contract-only definitions are not deployed as callable APIs until matching handlers exist.

## Consequences

- File state, audit, links, and history have one identity across Drawing, Procedure, and Standard documents; parent rollups remain efficient but are not independently writable.
- Idempotency, row-version checks, and transactional audit add request metadata and implementation complexity, but make retries and concurrent actions deterministic.
- SharePoint remains outside the Dataverse transaction. Publication evidence gates approval, while allowing submission avoids making repository availability a data-entry outage.
- Personal views cannot be repurposed as administrative queues; privileged discovery occurs through Approvals and security-aware Search.
- Keeping adapters avoids a flag-day migration at the cost of temporarily supporting both legacy and v2 entry points.

## Alternatives considered

- **Make the numbering-group parent authoritative:** rejected because partial file checkout, file-keyed audit, and exact-file links would become inconsistent; the trade-off of file authority is maintaining a derived parent rollup.
- **Deploy v2 Custom APIs before handlers exist:** rejected because clients could invoke callable contracts with no implementation; contract-only metadata provides early integration stability without that operational risk.
- **Let Power Automate or the Code App perform lifecycle writes:** rejected because neither provides one atomic, row-version-guarded Dataverse transaction; they remain notification and advisory clients.
- **Require SharePoint proof before submission:** rejected because a repository delay would block user handoff; approval is the controlled publication boundary.
- **Replace legacy APIs immediately:** rejected because existing clients would break; temporary adapters trade short-term duplication for a staged migration.
