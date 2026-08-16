# ADR-0034: Archive successfully-copied files (subflow `wf-archive-file`)

**Status:** Accepted, amends ADR-0003 — **blocked by an external file-share permission**
**Date:** 2026-08-16

## Context

[ADR-0003](0003-dedup-state-external-table.md) originally decided source
files stay untouched after a successful copy, with "move to an Archive
folder" explicitly considered and rejected in favor of leaving the source
share fully under the upstream owner's control. The user has now asked
for that Archive behavior after all: move a file to
`\\dcna30v004\AP_Invoice_LogicApp_Integration\Archive` once it has been
successfully copied to SharePoint.

## Decision

A new child workflow, **`wf-archive-file`**, called from `wf-copy-invoices`
immediately after a successful copy — a "subflow" per the user's explicit
request, matching the existing `wf-send-digest-email` pattern (single
source of truth, called from multiple places if ever needed again).

### Scope decisions (confirmed with the user)

- **Archive path is per-environment**, via a new `FILESHARE_ARCHIVE_FOLDER`
  app setting (mirrors the existing `FILESHARE_TRIGGER_FOLDER` pattern).
  Dev = `'Archive'` (confirmed live: a sibling of `LogicAppTest` under the
  same `\\dcna30v004\AP_Invoice_LogicApp_Integration` connection root
  folder). **Prod is deliberately left empty** — prod's `fileShareRootFolder`
  is a completely different share (`livelink_prd_data$`, not
  `AP_Invoice_LogicApp_Integration`), confirmed while designing this, so
  dev's path cannot be assumed to apply. An empty value makes the subflow
  safely no-op, which is the correct default until prod's real path is
  confirmed with the business/DataOps.
- **Only successfully-copied files are archived.** Failed/Abandoned files
  stay in the trigger folder indefinitely, unchanged from today (matches
  `Reset-AbandonedFiles.ps1`'s expectation that an abandoned file is still
  reachable there).
- **Collision handling: overwrite.** If a same-named file already exists
  in Archive, it's overwritten (`overwrite: true` on the copy operation) —
  not uniquified, not treated as a failure.

## Design: copy-then-delete, never atomic

The File System connector has **no native "Move" operation** (verified
against the live Azure Managed API definition, not assumed — confirmed
operations: `AppendFile`, `CopyFile`, `CreateFile`, `DeleteFile`,
`ExtractFolderV2`, `GetFileContent[ByPath]`, `GetFileMetadata[ByPath]`,
`List[Root]Folder`, `RenameFile`, `UpdateFile`). A move is implemented as
`CopyFile` followed by `DeleteFile`, and **the delete only runs if the
copy already succeeded** — the source file is never deleted unless the
archive copy is confirmed to exist first, so a partial/failed archive
attempt can never lose the file entirely.

### The subflow always returns HTTP 200, regardless of internal outcome

Archiving is secondary and best-effort — the file's `Succeeded` status in
`ProcessedFiles`/`FileRunEvents` is already written by `wf-copy-invoices`
*before* this subflow is even called, and must never be affected by
whether the archive-move itself succeeds. `wf-archive-file`'s `Response`
action has a `runAfter` that tolerates `Succeeded`/`Failed`/`Skipped`/
`TimedOut` on its internal logic, so it always cleanly returns 200 to its
caller. `wf-copy-invoices` additionally wraps its own
`Call_Archive_File` call with an absorbing `Compose_ArchiveOutcome`
action (tolerates all outcomes) as defense-in-depth, though in practice
the subflow's own always-200 design means the parent's view of the call
essentially never fails at all (confirmed live — see Consequences).

## ⚠️ Blocked by an external file-share permission — not fixable from this codebase

Verified live via a throwaway test (an existing, already-`Succeeded`
disposable test fixture, `TestInvoice_Word_4.docx` — never a real
invoice): the file-share service account behind the `filesystem`/
`filesystem-2` connection currently has **read-only** access to
`LogicAppTest` and **no access at all** to `/Archive`:

- Attempting to create a new file directly in `LogicAppTest` →
  `403 Forbidden`: *"The credentials for this connection do not have
  access to 'LogicAppTest'"*.
- Attempting to copy an existing file out to `/Archive` →
  `403 Forbidden`: *"The credentials for this connection do not have
  access to '/Archive'"*.
- All read operations (`ListFolder`, `GetFileContentByPath`) continue to
  work fine in real production runs throughout this investigation —
  this is specifically a write/delete permission gap, not a broken
  connection.

**This is a Windows/NTFS-level file-share ACL, granted by whoever
administers `\\dcna30v004\AP_Invoice_LogicApp_Integration`** (the same
account referenced in [ADR-0029](0029-two-service-account-identities.md)) —
not something fixable from Bicep, workflow JSON, or any script in this
repository. Tracked as an open item in
[`../operations/known-issues.md`](../operations/known-issues.md) until
write+delete access is granted on both `LogicAppTest` and `Archive`.

## Consequences

- **The `CopyFile` REST shape is confirmed correct** despite the
  permission block: a malformed request would fail at the connector/APIM
  layer with a generic schema error, not the specific, path-referencing
  business error actually returned. This was proven live before writing
  the real feature, not assumed.
- **`DeleteFile`'s exact REST shape remains unverified** — `Copy_To_Archive`
  fails first every time under the current permission state, so
  `Delete_Source_After_Archive` has never actually executed live. Built on
  the connector's established by-path convention (same as other by-id
  operations in this codebase), flagged explicitly as unverified in the
  action's own description. Revisit once permissions are granted and the
  delete step finally gets to run for the first time.
- **Verified live, end-to-end, that the safety design works exactly as
  intended**: triggered a real on-demand run through the self-heal path
  (`Check_SharePoint_Existing` succeeds → `On_Copy_Success` fires even
  without a new physical upload) to force a genuine `Call_Archive_File`
  invocation. Result: `Copy_To_Archive` failed (`Forbidden`, expected),
  `Delete_Source_After_Archive` correctly `Skipped` (source file
  preserved, zero data loss), `wf-archive-file`'s own run and
  `Call_Archive_File`'s status from the parent's perspective **both
  reported `Succeeded`**, the file's `ProcessedFiles` row stayed
  `Status: Succeeded` throughout, and **no Azure Monitor alert fired** —
  confirmed directly via the activity log, not assumed.
