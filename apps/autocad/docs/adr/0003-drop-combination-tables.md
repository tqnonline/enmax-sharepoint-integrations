# ADR 0003 - Drop Approved BB-AA and Asset-Unit combination tables

- Status: Accepted
- Date: 2026-07-08
- Supersedes ADR 0001 decision #4 (partial): "kept read-only" → fully removed
- Plan: seed/schema cleanup after ADR 0001 independent taxonomy

## Context

ADR 0001 removed combination *validation* from the reserve wizard. The seed loader and UI later stopped shipping / showing Approved BB-AA (`enmax_autocadbusinessasset`) and Asset-Unit (`enmax_autocadassetunit`) rows, but the Dataverse entities, relationships, alternate keys, plugin steps, and Code App datasources remained. That left dead schema, security surface, and deploy weight with no product path that writes or reads the tables.

## Decision

1. **Delete both combination entities from the unmanaged solution** (Entity.xml trees, Solution.xml RootComponents, Relationships.xml and parent relationship files, `provision_schema.py` tables/rels/alt keys).
2. **Unregister** `SetAppOwnerPlugin` Create steps and `AuditEmitter` coverage for those logical names.
3. **Remove** Code App datasources, generated services/models exports, and power-config entries (not merely hide them).
4. **Retain** `enmax_autocadsystemscope` as an empty optional admin surface; it is not part of this drop.
5. **Environment cleanup** requires `solution/scripts/migrate_drop_combination_tables.py` *before* (or while) removing the tables: it unregisters leftover `SdkMessageProcessingStep` rows (`SetAppOwnerPlugin` / `AuditEmitter` Create steps block `DeleteEntity`), optionally deletes junction rows, then calls `DeleteEntity`. Importing a solution that omits a table does **not** delete it from an environment that already has it.

## Consequences

- Fresh environments never get the junction tables.
- Existing DEV/UAT/PROD must run the migration (or manual Maker delete) once; until then leftover tables remain offline schema only.
- Compensating control for unconstrained taxonomy mixes remains the Phase 3 anomaly report (ADR 0001).

## Alternatives considered

- **Keep tables read-only forever:** rejected — ongoing solution size, plugin step noise, and false “still supported” signal.
- **Soft-delete / rename only:** rejected — same dead weight without simplifying the model.
