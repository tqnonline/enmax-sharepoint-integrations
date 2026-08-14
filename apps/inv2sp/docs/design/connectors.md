# Connector facts — verified against primary sources

Every connector detail below was independently verified against real
Swagger specs, official Microsoft documentation, and/or live behavior
before being written into a workflow — **not** trusted from memory. This
practice was adopted project-wide after an earlier near-miss (fabricated
Consumption-Logic-App metric names almost shipped in the monitoring layer
— see [ADR-0011](../decisions/0011-three-layer-monitoring-architecture.md)).
Anyone adding a new connector call to this project should verify facts the
same way, not assume model/training-data memory is correct.

## File System connector

- **Max file size: 30 MB.** A hard platform limit for the connector's
  general operations (verified against
  `learn.microsoft.com/connectors/filesystem`), not configurable per
  environment. This is the source of the `FileTooLarge` classification in
  the [error taxonomy](../decisions/0019-error-taxonomy.md) — an earlier
  placeholder value of 250 MB was corrected to the real 30 MB limit.
- **`ListFolder` returns a raw array**, not a `{value: [...], nextLink}`
  shape. Enabling Logic Apps' native pagination handling against this
  operation fails **every single call**, not just large folders, with
  `InvalidPageResponse: response is missing a property value of type
  array`. Do not set `runtimeConfiguration.paginationPolicy` on
  `List_Files_In_Folder`.
- **REST path corrections:** `folders` (not `foldersV2`), no `/v2/` prefix
  on `GetFileContentByPath`. `GetFileMetadataByPath` maps to the literal
  path segment `GetFileByPath` (not a literally-named
  `GetFileMetadataByPath` path).
- Direct ARM-proxy folder/file listing on a connection is permanently
  blocked (`OperationNotAllowed: only Test Connections are allowed`) — not
  fixable. Use the runtime-host diagnostic pattern in
  [`../operations/runbook.md`](../operations/runbook.md) instead.

## SharePoint Online connector

- `PatchFileItem` requires a `/patchfileitem` trailing path segment.
- V1-kind connections cannot support the `accessPolicy` /
  ManagedServiceIdentity auth model at all — see
  [ADR-0004](../decisions/0004-sharepoint-office365-connections-v2.md).

## Office 365 Outlook connector

- Send path: `/v2/Mail`.
- Limits: 49 MB max message content size; 500 MB per 5 minutes per
  connection.

## Key Vault service provider

- Connector parameter is `VaultUri` (not `vaultNameOrUri`), with a nested
  `authProvider` object — this is easy to get wrong from memory/similar
  connectors.

## Azure Tables service provider

- Connection parameter is `connectionString` (not
  `storageAccountConnectionString`).
- Service provider id is `azureTables` (not `AzureTables` — case-
  sensitive).
- No server-side aggregation (`sum`, `count`, `groupby`) — every count
  used in this project is either `length()` of a targeted, filtered query,
  or a client-side dedup via `union(arr, arr)` (WDL has no `distinct()`
  function either).

## Workflow Definition Language (WDL) — general gaps worth knowing

- **No hash/cryptography function category exists at all** — this is why
  the dedup key ([ADR-0017](../decisions/0017-dedup-key-design.md)) uses
  `base64()` of a concatenated identity tuple instead of a hash.
- **No `sum()`/`reduce()`/aggregate function** — any running total must be
  built with an `IncrementVariable` inside a `Foreach` pinned to
  `runtimeConfiguration.concurrency.repetitions: 1` (Foreach iterations
  otherwise run in parallel, and shared-variable increments would race).
- **No `filter()` function** — the established convention in this project
  is a separate, targeted server-side table query per condition, rather
  than fetching once and filtering client-side (there is a native `Query`/
  "Filter array" **action** type distinct from any expression function,
  but this project has consistently used the targeted-query convention
  instead, for consistency).
- **No `distinct()` function** — `union(arr, arr)` (an array unioned with
  itself) is the idiomatic dedup trick used throughout this project.
- **`createArray()` requires at least one argument** — `createArray()`
  with zero arguments throws `InvalidTemplate`, not an empty array. Do not
  use it as an "empty array" placeholder (e.g. `union(arr,
  createArray())`) — union an array with itself instead.
- **Recurrence trigger timezone must be a Windows TZ ID**, not IANA — see
  [ADR-0026](../decisions/0026-recurrence-trigger-timezone.md).
- **Variables must be initialized exactly once, at the top level** — never
  inside a repeating (`Foreach`) action. Re-initializing on iteration 2+ is
  undefined/invalid; use a `Compose` action instead for any
  per-iteration-fresh value.
- **Action `description` fields have a hard, undocumented ~1024-character
  limit.** Exceeding it does not fail the deployment visibly — see
  [`../operations/runbook.md`](../operations/runbook.md) for the full
  incident this caused and the standing discipline it created.
