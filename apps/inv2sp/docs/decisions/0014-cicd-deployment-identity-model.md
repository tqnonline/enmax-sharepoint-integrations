# ADR-0014: CI/CD and deployment identity model

**Status:** Accepted — supersedes an earlier assumption
**Date:** Phase 3 (correction)

## Context

The original plan assumed "existing app registration + OIDC" as the
GitHub Actions deployment identity — this turned out to be an unconfirmed
placeholder, not a verified fact. Discovery of a sibling prototype repo
(`tqnonline/enmax-apinvoice-integration`, an earlier attempt at the same
integration, targeting the same resource group) confirmed no app
registration or service principal exists for this project, and unattended
cloud deployment is not feasible without one given the interactive
PIM/MFA activation model this tenant requires for privileged operations.

## Decision

Local, PIM-activated PowerShell scripts are the **primary deployment
path** for both infrastructure and workflows, in both environments.
GitHub Actions (Phase 5) is scoped down to **PR validation only** — Bicep
build/lint/what-if, PSScriptAnalyzer, Pester — and never performs an
unattended deploy/apply in either environment.

## Rationale

Matches the pattern already proven working in the sibling prototype repo,
and matches Phase 4's already-planned script-based deployment scope.

## Consequences

- A recommendation to archive the sibling prototype repo (to prevent
  future collision/confusion) was noted but **not yet actioned** as of
  this writing.
- Every deployment script in `scripts/` assumes an interactively
  PIM-activated `az` session (`Invoke-PimActivation.ps1`), not a service
  principal — see
  [`../operations/scripts-reference.md`](../operations/scripts-reference.md).
