# ADR-0019: Error taxonomy (11 categories)

**Status:** Accepted, v1 — expected to evolve
**Date:** Phase 2/3

## Context

Digest and alert emails need actionable error information, not raw
freetext exception dumps.

## Decision

Classify every failure into one of 11 categories — `AuthExpired`,
`PermissionDenied`, `GatewayUnavailable`, `SourcePathNotFound`,
`FileLocked`, `FileTooLarge`, `InvalidFileName`, `NameConflict`,
`ContentTypeMissing`, `Transient`, `Unclassified` — each mapped to a
suggested action and owning team in `workflows/parameters.json` (editable
without a code change). Implemented in `Compose_ErrorCategory` inside
`wf-copy-invoices`, deliberately simple and HTTP-status-string-driven
(v1).

## Alternatives considered

- **Freetext error messages only** — rejected: not actionable inside a
  digest aimed at a non-technical audience.

## Consequences

- Explicitly a v1 classification, expected to be refined once real
  production error patterns are observed.
- The `ContentTypeMissing` category's practical relevance is now
  reduced given ADR-0024 (content-type patching removed from the engine
  entirely) — the category itself was not removed from the taxonomy, but
  is unlikely to be hit going forward unless content-type patching is
  reintroduced.
