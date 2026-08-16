# ADR-0032: Documentation format and ADR granularity

**Status:** Accepted
**Date:** Phase 0/1, executed 2026-08-11

## Context

Need a documentation approach that's genuinely maintainable by the team
long-term, and a decision on how much project history to carry forward
into the permanent, committed documentation set.

## Decision

- **Format:** plain Markdown under `docs/`, not a static-site generator
  (e.g. MkDocs + GitHub Pages) — no build step, readable directly on
  GitHub, zero extra tooling dependency.
- **Diagrams:** Mermaid (renders natively on GitHub), not draw.io/external
  diagram files.
- **ADR granularity:** individual numbered ADR files (this decision log)
  plus a single index table (`docs/decisions/README.md`), rather than one
  consolidated running log — each decision gets its own file, immutable
  once written; a changed decision gets a **new** ADR that supersedes the
  old one, rather than editing history in place.
- **History/provenance:** dropped entirely from the committed repository.
  No `history/` folder, no as-found-state snapshot document, no committed
  ARM export — the repository reads as a clean, current-state build.
  Prerequisite/handoff documents (for stakeholder communication) are
  generated to a gitignored `handoff/` folder and are never committed;
  the underlying permission-model engineering rationale that would
  otherwise live only in a handoff doc is captured in the permanent
  `docs/design/` set instead, so it isn't lost.

## Consequences

- The working session log (`PLAN.md`, at the repository root) remains
  gitignored and is **not** a substitute for this documentation set — it
  is a scratch/evidence log for active development sessions, not a
  permanent team artifact. Anything in `PLAN.md` worth keeping permanently
  belongs in `docs/`, as an ADR, a design doc, or a runbook entry — this
  documentation set (`docs/overview`, `docs/decisions`, `docs/design`,
  `docs/operations`) is the result of executing that principle for the
  project's first real documentation pass.
