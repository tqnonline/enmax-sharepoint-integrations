# Monorepo Migration Plan — `enmax-sharepoint-integrations`

Status: **in execution**. This document is the authoritative record of the merge
decisions and phases for consolidating `enmax-autocad` and
`enmax-apinv2sp-integration` into this monorepo. Source repos:

- `https://github.com/tqnonline/enmax-autocad` (Power Apps Code App + Dataverse solution — document numbering)
- `https://github.com/tqnonline/enmax-apinv2sp-integration` (Azure Logic App Standard — AP invoices → SharePoint)

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Layout | `apps/autocad` + `apps/inv2sp`; flatten autocad's inner `apps/` (`apps/code-app` → `apps/autocad/code-app`) |
| 2 | inv2sp stages | 2-stage (dev/prod); no UAT — dev RG (`environmentCode=T`) stays Dev/UAT/QA combined |
| 3 | Environments | Shared `dev` / `uat` / `prod`, plus `prod-plan` (credential holder for inv2sp's pre-approval what-if, no reviewers, never deploys) |
| 4 | Promotion | `dev` → DEV auto · `main` → UAT auto (autocad only) · PROD manual `workflow_dispatch` for both apps |
| 5 | History | Preserve both repos' `dev` history via `git filter-repo` + `--allow-unrelated-histories` merge |
| 6 | Repo / runners | New repo `tqnonline/enmax-sharepoint-integrations`; all CI/CD jobs target corp self-hosted runners (`windows-latest-enmax-corp`, `ubuntu-latest-enmax-corp`) |
| 7 | `prod-plan` env | Added — inv2sp's `deploy-prod.yml` runs `what-if` before the approval gate; without a credentialed no-reviewer environment, the reviewer either approves blind or secrets go repo-level (worse) |
| 8 | Orphan branches | autocad's `specs` and `runbooks` (orphan, no shared history with `main`) carried over unchanged |
| 9 | autocad auth (**material change**) | **Hybrid**: SPN authenticates steps 1–6 (pack/import/plugins/optionsets/seed/roles) + integration tests. A **service account** (`eec_pwrplat_svc@enmax.com`) via **ROPC** (`pac auth create --username/--password`) authenticates ONLY the Code App push step (`pac code push`), because SPNs cannot own Code Apps in this tenant. Corp runners are **ephemeral** — no cached-profile fallback exists, so ROPC working is a hard Phase 0 gate. |

## Why this shape

Both repos' `main` branches are vestigial (inv2sp `main` = init commit only, 6
commits ahead on `dev`; autocad `main` = 79 commits behind `dev`). All real
work lives on `dev` in both, so the monorepo's `dev`/`main` start from a clean,
identical bootstrap rather than inheriting either repo's stale `main`.

Every path resolution in both source repos is `$PSScriptRoot` /
`$PSCommandPath` / `__file__`-relative, not `.git`-root discovery — inv2sp's
`Get-Inv2SpRepoRoot` needs **zero** changes after the subdirectory move.
autocad has ~50 references across ~37 files to `apps/code-app` that need a
mechanical rewrite to `code-app` because its inner `apps/` folder is flattened
away when it becomes `apps/autocad/`.

## Environments and secrets

| Env | Reviewers | Secrets | Consumers |
|---|---|---|---|
| `dev` | none | `AUTOCAD_*` ×9, `INV2SP_*` ×4 | both, auto on push to `dev` |
| `uat` | required | `AUTOCAD_*` ×9 | autocad only, auto on push to `main` |
| `prod` | required | `AUTOCAD_*` ×9, `INV2SP_*` ×4 | both, `workflow_dispatch` only |
| `prod-plan` | none | `INV2SP_*` ×4 | inv2sp `what-if` job only — never deploys |

```
AUTOCAD_SP_CLIENT_ID          # SPN - steps 1-6, integration tests
AUTOCAD_SP_CLIENT_SECRET
AUTOCAD_TENANT_ID
AUTOCAD_SVC_USERNAME          # service account (ROPC) - Code App push only
AUTOCAD_SVC_PASSWORD
AUTOCAD_DATAVERSE_URL
AUTOCAD_APP_ID
AUTOCAD_APP_DISPLAY_NAME
AUTOCAD_POWER_APPS_ENV_ID

INV2SP_AZURE_CLIENT_ID        # SPN unchanged (ADR-0033)
INV2SP_AZURE_CLIENT_SECRET
INV2SP_AZURE_TENANT_ID
INV2SP_AZURE_SUBSCRIPTION_ID
```

## Branch protection

Default branch `dev`. Squash-merge only (merge commit / rebase disabled).
Rulesets `protect-main` and `protect-dev` (`refs/heads/main`,
`refs/heads/dev`) are identical: no bypass actors, no deletion, no
force-push, linear history required, 1 approving review + CODEOWNERS review +
last-push-reapproval + thread resolution, squash-only merge method, required
status checks `ci-gate` and `Validate source/target branch`, strict (branch
must be up to date).

"Only `dev` may merge to `main`" is not natively expressible in GitHub
rulesets — enforced instead by `branch-policy.yml` (inherited from inv2sp,
promoted to repo root) as a required status check on both branches.

## Pipelines

| File | Trigger | Env | Notes |
|---|---|---|---|
| `ci.yml` | PR → `dev`\|`main` | — | required check `ci-gate`, aggregates all app jobs so path-filtered jobs never deadlock a required check |
| `branch-policy.yml` | PR → `dev`\|`main` | — | required check; enforces main←dev, dev←feature/fix/hotfix/chore/docs/refactor/test/ci |
| `cd-autocad-dev.yml` | push `dev` + `apps/autocad/**` | `dev` | + integration tests |
| `cd-autocad-uat.yml` | push `main` + `apps/autocad/**` | `uat` | |
| `cd-autocad-prod.yml` | `workflow_dispatch` | `prod` | typed-confirm input |
| `cd-inv2sp-dev.yml` | push `dev` + `apps/inv2sp/**` | `dev` | new — dev was local-only before |
| `cd-inv2sp-prod.yml` | `workflow_dispatch` | `prod-plan` → `prod` | what-if outside gate, then reviewer-gated deploy |
| `ops-autocad.yml` | `workflow_dispatch` | selectable | dev-finish, flows, admin solution, verify |
| `ops-inv2sp.yml` | `workflow_dispatch` | selectable | enable-triggers, test-connections, on-demand-run, reset-abandoned |
| `_rw-autocad-deploy.yml` | `workflow_call` | input | 8 steps incl. dual `pac auth` profile switch (SPN → service account → SPN) |
| `_rw-inv2sp-deploy.yml` | `workflow_call` | input | Deploy-Infrastructure → Deploy-Workflows |

Composite actions: `setup-autocad`, `setup-inv2sp`, `pac-auth-spn`,
`pac-auth-service-account`, `azure-login`.

## Phases

0. **Blockers** — ROPC spike (highest risk, no fallback on ephemeral
   runners), corp runner capability probe (toolchain + egress), inv2sp
   dev/prod SPN provisioning (ServiceNow), rescue dangling commit `fd67708`,
   create the GitHub repo.
1. **Freeze** — stop new work on both source repos during migration.
2. **History-preserving import** — `git filter-repo` each `dev` branch into
   its target subdirectory, merge both into a fresh `main` with
   `--allow-unrelated-histories`. Carry `specs`/`runbooks` orphan branches
   unchanged. Branch `dev` from `main` immediately after, byte-identical.
3. **Root scaffolding** — single npm workspace root, single lockfile,
   `.nvmrc`, root docs, delete per-repo `.github/` after mining.
4. **Path re-anchoring** — mechanical `apps/code-app` → `code-app` rewrite
   (~50 refs / 37 files) in an isolated, revertible commit; gate on the full
   test suite (vitest, dotnet test, Pester, pytest).
5. **CI/CD authoring** — the 11 workflows + 5 composite actions above,
   folding in fixes that were free while rewriting: inv2sp's 99 Pester tests
   and Bicep validation into CI (never ran in CI before), autocad's 19 pytest
   modules into CI (same), `branch-policy.yml` allow-list gains `feat/*` and
   `ci/*`, CODEOWNERS extended to cover both apps.
6. **Prove it** — apply rulesets, smoke-test PR against both required
   checks, full promotion rehearsal dev → uat → prod (dispatch), archive both
   source repos read-only.

## Risks (highest severity first)

1. **ROPC blocked by Conditional Access** — ephemeral runners mean no cached
   auth fallback; if blocked, Code App push cannot run in CI at all. Mitigate
   with a CA exclusion scoped to the service account + PAC CLI app IDs +
   runner egress ranges, or degrade to `push-code-app: false` (steps 1–6 still
   auto-deploy, operator runs the push manually).
2. **Corp runner lacks toolchain or egress** to npm/NuGet/PyPI/Actions-cache/
   Dataverse/ARM. Mitigate with a pre-baked runner image request to the
   platform team.
3. Both inv2sp SPNs (dev + prod) are unprovisioned and prod Azure has zero
   resources deployed — ServiceNow lead time gates `cd-inv2sp-*`.
4. Ephemeral runners add 6–10 minutes of toolchain setup per job — mitigate
   with aggressive `actions/cache`; real fix is the pre-baked image (risk 2).
5. Shared `prod` environment means one reviewer list approves both apps —
   accepted; mitigated by CODEOWNERS + typed-confirm inputs on both prod
   workflows.
6. Service-account password rotation breaks CD until the runbook and alerting
   cover it.
7. Phase 4 path flatten could break something pytest/Pester didn't catch
   before (they were never run in CI) — isolated, revertible PR.

## Explicitly out of scope (log as issues, do not expand this migration)

**autocad** — unmanaged solutions in prod, `prod.deploymentSettings.json`
never passed to `pac solution import`, missing `app_config.prod.yaml`, cloud
flows + admin solution absent from CD (manual `Invoke-PpDeploy` steps 9–11
only), duplicate ADR numbers 0002/0004, `IssueNumbers.snk` committed to
source, triplicated 23-datasource map, stale `.power/schemas/`, Playwright
e2e never run.

**inv2sp** — Key Vault region drift (`westus` vs `UW2` name),
`filesystem-2` connection naming, `enableHardening=false` in prod, doc drift
(README workflow count, `-Enabled` param that doesn't exist),
unreliable ADR cross-references, `PLAN.md` / `handoff/` migration decision.
