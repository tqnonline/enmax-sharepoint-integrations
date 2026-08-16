# ADR-0017: Dedup key design — base64 identity tuple, not a hash

**Status:** Accepted
**Date:** Phase 3

## Context

Need a deterministic, unique, Azure Table `RowKey`-safe key to identify a
distinct file for dedup purposes.

## Decision

`base64()` of the concatenated identity tuple
`(lower(fullPath) | name | lastModifiedUtc | sizeBytes)`, with `+`/`/`
substituted (the only base64 characters disallowed in a Table `RowKey`).

## Alternatives considered

- **A hash function** — rejected because none exists: verified against the
  complete Workflow Definition Language function reference, there is no
  hash/cryptography category in WDL at all.

## Rationale

Base64 is reversible (unlike a true hash), which is a genuine debugging
advantage here, not a weakness — determinism and uniqueness are all that's
required for this dedup use case, not irreversibility.

## Consequences

- If the same physical file is re-touched by an upstream process (its
  `LastModified` or `Size` changes even without a meaningful content
  change), it produces a **new** dedup key and is treated as a genuinely
  new file — this is an accepted characteristic of the design, not a bug,
  since WDL has no reliable way to fingerprint file *content* directly.
- This key format is reused as the `RowKey` suffix for `FileRunEvents`
  (`{RunId}_{DedupKey}` — see ADR-0023).
