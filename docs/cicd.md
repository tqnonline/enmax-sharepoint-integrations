# CI/CD contract

This is the binding contract for both apps' pipelines. Per-app deploy
mechanics (what each step actually runs) live in each app's own
`docs/operations/cicd.md` (inv2sp) / `docs/deploy/` (autocad). This document
only covers what's shared: branch → environment mapping, secret naming,
and the required-check design.

## Branch → environment mapping

| Branch event | autocad | inv2sp |
|---|---|---|
| push to `dev` | auto-deploy → `dev` environment | auto-deploy → `dev` environment |
| push to `main` | auto-deploy → `uat` environment | **no-op** — inv2sp has no UAT stage; `main` is a release-candidate marker only |
| `workflow_dispatch` | deploy → `prod` environment (typed confirmation input) | deploy → `prod` environment (typed confirmation input), preceded by a `prod-plan` what-if job |

inv2sp intentionally stays 2-stage (dev/prod). Its dev resource group
(`RG-ENMAX-COR-UW2-INV2SP-T`, `environmentCode=T`) is documented as
Dev/UAT/QA combined — see `apps/inv2sp/docs/decisions/0001-adopt-dev-resources-as-is.md`.
This is a deliberate asymmetry with autocad, not a gap.

## GitHub Environments

Environments are repo-scoped, so secrets are **app-prefixed**
(`AUTOCAD_*` / `INV2SP_*`) rather than relying on environment name alone to
disambiguate.

| Environment | Reviewers | Secrets | Used by |
|---|---|---|---|
| `dev` | none | `AUTOCAD_*` (9), `INV2SP_*` (4) | both apps, auto |
| `uat` | required | `AUTOCAD_*` (9) | autocad only, auto |
| `prod` | required | `AUTOCAD_*` (9), `INV2SP_*` (4) | both apps, manual dispatch |
| `prod-plan` | **none** | `INV2SP_*` (4) | inv2sp's pre-approval `what-if` job only — this environment never deploys anything. Exists so the reviewer sees a real diff *before* approving `prod`, matching inv2sp's existing ADR-0033 design. |

### Secret names

```
AUTOCAD_SP_CLIENT_ID          # SPN — pack/import/plugins/optionsets/seed/roles, integration tests
AUTOCAD_SP_CLIENT_SECRET
AUTOCAD_TENANT_ID
AUTOCAD_SVC_USERNAME          # service account (ROPC) — Code App push ONLY (SPNs cannot own Code Apps)
AUTOCAD_SVC_PASSWORD
AUTOCAD_DATAVERSE_URL
AUTOCAD_APP_ID
AUTOCAD_APP_DISPLAY_NAME
AUTOCAD_POWER_APPS_ENV_ID

INV2SP_AZURE_CLIENT_ID        # SPN, ADR-0033 — unchanged from the source repo
INV2SP_AZURE_CLIENT_SECRET
INV2SP_AZURE_TENANT_ID
INV2SP_AZURE_SUBSCRIPTION_ID
```

## autocad's hybrid auth model (material change from the source repo)

The source repo's CD workflows pushed the Code App using the same SPN as
every other step. That never actually worked — `scripts/push-codeapp-uat.ps1`
documents that Service Principals cannot own Code Apps in this tenant, and
`main` was 79 commits behind `dev` because the UAT/prod path had never run
end-to-end.

Resolution: split by auth **subject**, not by environment.

| Steps | Identity | Why |
|---|---|---|
| pack, import, register plugins, optionsets, seed, roles, integration tests | SPN (`AUTOCAD_SP_*`) | Plain Dataverse Web API — works fine under an application user |
| Code App push (`pac code push`) | Service account, ROPC (`AUTOCAD_SVC_*`) | The one operation that rejects SPN ownership |

The runner is **ephemeral** (ubuntu/windows-latest-enmax-corp spin up clean
per job) — there is no cached `pac auth` profile to fall back on between
runs. If Conditional Access blocks ROPC for the service account, the
reusable workflow's `push-code-app` input can be set to `false`: steps 1–6
still auto-deploy, and the job prints the exact manual command an operator
runs locally instead of silently failing.

`pac code push` (not `npx power-apps push`) is used from CI: the documented
reason for preferring the npm CLI was that `pac`'s Code App script was
"missing/broken on macOS" — irrelevant on the Windows corp runners CI
actually uses, and `pac code push` correctly honors an active `pac auth`
user profile.

## Required status checks (why there's a `ci-gate` job)

`pull_request` + `paths:` filters deadlock with required status checks: a
job that never runs because its path filter didn't match also never reports
a status, and GitHub blocks the PR forever waiting for a check that will
never appear. `ci.yml` avoids this with a single always-running `changes`
job (no path filter) feeding per-app jobs, and a final `ci-gate` job
(`if: always()`) that is the *only* job configured as a required check. It
inspects `needs.*.result` and fails if anything real failed; skipped jobs
(because their app's paths didn't change) are not failures.

## Runner model

All jobs target corp self-hosted runners (`windows-latest-enmax-corp`,
`ubuntu-latest-enmax-corp`) per architecture decision. These are **ephemeral**
— every job installs its full toolchain (Node 22, .NET SDK 10, Python 3.11,
`uv`, PAC CLI, Azure CLI/Bicep) from scratch. Composite actions
(`.github/actions/setup-autocad`, `.github/actions/setup-inv2sp`) centralize
this so it's one place to add caching or later swap to a pre-baked runner
image.
