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
| 3 | Workflow definitions (5 Logic App workflows, error handling, reporting) | Not started |
| 4 | PowerShell deployment tooling | Not started |
| 5 | GitHub Actions CI/CD | Not started |
| 6 | Production deployment | Not started |

## Repository layout

```
infra/          Bicep IaC - naming module, 14 resource modules, per-environment params
scripts/        PowerShell deployment tooling (Phase 4) + Python doc-generation utilities
workflows/      Logic App Standard workflow definitions (Phase 3)
docs/           Architecture, ADRs, operations runbooks (written per-phase)
tests/          Pester + Bicep what-if smoke tests (Phase 4)
.github/        CI/CD workflows (Phase 5) + branch policy enforcement
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
az deployment group what-if \
  --resource-group <rg-name> \
  --template-file infra/main.bicep \
  --parameters infra/params/<dev|prod>.bicepparam
```

Full deployment tooling (`scripts/Deploy-*.ps1`) lands in Phase 4.

## Branching

- `main` — production-tracking, protected. Only accepts pull requests from `dev`.
- `dev` — integration branch, protected. Accepts pull requests from feature branches.
- `feature/*` — one branch per phase/change, PR into `dev`.
