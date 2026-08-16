# enmax-sharepoint-integrations

Monorepo for ENMAX's Power Platform / SharePoint integration applications.
Merged from `enmax-autocad` and `enmax-apinv2sp-integration` — see
[`docs/MIGRATION_PLAN.md`](docs/MIGRATION_PLAN.md) for the merge rationale,
decisions, and phase log, and [`docs/cicd.md`](docs/cicd.md) for the
branch/environment/pipeline contract that governs both apps.

## Applications

| App | Path | What it is |
|---|---|---|
| **autocad** | [`apps/autocad`](apps/autocad) | Power Apps Code App (React 19/Vite) + Dataverse solution for document number generation & lifecycle management ("EEC Generation Document Management system") |
| **inv2sp** | [`apps/inv2sp`](apps/inv2sp) | Azure Logic App Standard — copies AP invoice files from an on-prem file share to SharePoint Online via an on-premise data gateway, on schedule or on demand |

Each app keeps its own README, docs, ADRs, and deploy scripts inside its
subdirectory — only cross-cutting decisions (the monorepo merge itself, the
shared branch/environment/pipeline contract) live at the root `docs/`.

## Branching model

- `dev` is the default branch. Feature work merges into `dev` via squash-merge
  PR from a conventionally-named branch (`feat/*`, `fix/*`, `hotfix/*`,
  `chore/*`, `docs/*`, `refactor/*`, `test/*`, `ci/*`).
- `main` only accepts squash-merge PRs **from `dev`** — never directly from a
  feature branch. Enforced by `.github/workflows/branch-policy.yml` as a
  required status check (GitHub branch protection cannot express this rule
  natively).
- Both `main` and `dev` are protected: no force-push, no deletion, linear
  history, 1 approving review + CODEOWNERS + required status checks
  (`ci-gate`, branch-policy), squash-only merge method.

## CI/CD

See [`docs/cicd.md`](docs/cicd.md) for the full environment/secret/pipeline
matrix. Summary: `dev` push auto-deploys to the `dev` tenant/environment for
both apps; `main` push auto-deploys autocad to `uat`; production for both
apps is `workflow_dispatch`-only with a typed confirmation and a required
reviewer approval.

## Local development

```
node --version   # engines requires >=22
npm install      # single root lockfile, npm workspaces
```

autocad-specific tooling (PAC CLI, .NET SDK, Python/uv) and inv2sp-specific
tooling (Azure CLI, Bicep, PowerShell 7) are documented in each app's own
`docs/deploy/` / `docs/operations/` folder.
