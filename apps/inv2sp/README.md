# AP Invoice → SharePoint Integration (INV2SP)

Azure Logic App Standard integration that copies accounts payable invoice
files from an on-premises network share to a SharePoint Online library via
the existing on-premises data gateway, on a schedule, on file arrival, and
on demand — with a daily digest report and immediate failure alerting.

**Classification:** Confidential · **Cost Centre:** 36027 · **Project:** CORP-SharePoint-Integrations

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Infrastructure as code (Bicep) | ✅ Complete |
| 2 | Merged into Phase 1 (App Insights, diagnostics, state tables, `office365` connection, monitoring) | ✅ Complete |
| 3 | Workflow definitions (6 Logic App workflows, error handling, reporting, audit trail) | ✅ Complete |
| 4 | PowerShell deployment tooling + Pester tests | ✅ Complete (99 Pester tests passing) |
| 5 | GitHub Actions CI/CD - prod deploy pipeline built ([ADR-0033](docs/decisions/0033-github-actions-prod-deployment-spn.md)); PR validation workflows not yet built | 🔄 In progress — prod pipeline cannot run yet, SPN not provisioned (see [known issues](docs/operations/known-issues.md)) |
| 6 | Production deployment | Blocked — see [known issues](docs/operations/known-issues.md) (prod SharePoint target folder unconfirmed) |

See [`docs/overview/overview.md`](docs/overview/overview.md) for what this
integration does end to end, [`docs/decisions/README.md`](docs/decisions/README.md)
for the full architecture decision log, and
[`docs/operations/known-issues.md`](docs/operations/known-issues.md) for
everything still open.

## Repository layout

```
infra/          Bicep IaC - naming module, resource modules, per-environment params
scripts/        PowerShell deployment tooling (Phase 4)
workflows/      Logic App Standard workflow definitions (Phase 3) - 6 workflows:
                wf-copy-invoices (shared engine), wf-scheduled-copy, wf-ondemand-copy,
                wf-daily-digest, wf-run-digest, wf-send-digest-email
docs/           Architecture (docs/overview), ADRs (docs/decisions), design (docs/design),
                operations runbook (docs/operations)
tests/          Pester tests (Phase 4) - deployment scripts + workflow JSON validation
.github/        deploy-prod.yml (prod deploy pipeline, ADR-0033) + branch-policy.yml
```

## Environments

| | Dev / UAT / QA | Production |
|---|---|---|
| Resource group | `RG-ENMAX-COR-UW2-INV2SP-T` | `RG-ENMAX-COR-UW2-INV2SP-P` |
| Subscription | `ENMAXCORSB001D` | `ENMAXCORSB001P` |
| Region | `westus2` | `westus2` |

Dev's pre-existing resources (deployed manually before this repository
existed) are **adopted as-is** rather than recreated — see
`infra/naming.bicep` and the module headers under `infra/modules/` for the
reasoning. Production is genuinely greenfield.

## Deploying

```bash
./scripts/Deploy-All.ps1 -Environment dev -Force
```

Or step by step — see [`docs/operations/scripts-reference.md`](docs/operations/scripts-reference.md)
for every script's purpose and usage:

```bash
./scripts/Test-Prerequisites.ps1 -Environment dev
./scripts/Deploy-Infrastructure.ps1 -Environment dev -WhatIf   # preview
./scripts/Deploy-Infrastructure.ps1 -Environment dev -Force
./scripts/Deploy-Workflows.ps1 -Environment dev -Force
```

**Dev**: local, PIM-activated PowerShell scripts only — see
[ADR-0014](docs/decisions/0014-cicd-deployment-identity-model.md).

**Prod**: same scripts, called from a manual/reviewer-gated GitHub Actions
pipeline authenticating as a service principal — see
[ADR-0033](docs/decisions/0033-github-actions-prod-deployment-spn.md) and
[`docs/operations/cicd.md`](docs/operations/cicd.md). Not runnable yet
(SPN not provisioned — see [known issues](docs/operations/known-issues.md)).

## Testing

```bash
pwsh -Command "Invoke-Pester -Path ./tests"
```

99 tests, all offline/static (no Azure credentials required): workflow
JSON validation (schema, the 1024-char action-description limit,
`runAfter` graph integrity, several live-incident regression checks),
PowerShell script validation (AST parse, PSScriptAnalyzer, parameter
contracts), Bicep compilation and static regression checks, and unit
tests for the shared PowerShell module.

## Branching

- `main` — production-tracking, protected. Only accepts pull requests from `dev`.
- `dev` — integration branch, protected. Accepts pull requests from feature branches.
- `feature/*` — one branch per phase/change, PR into `dev`.
