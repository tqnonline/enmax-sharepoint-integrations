# CI/CD: production deployment pipeline

`.github/workflows/deploy-prod.yml` — see
[ADR-0033](../decisions/0033-github-actions-prod-deployment-spn.md) for
the full design rationale. This is the **only** GitHub Actions workflow
that touches Azure; `branch-policy.yml` is unrelated (PR branch-naming
enforcement only, no Azure access).

## Prerequisites (one-time setup, not automated)

1. **The service principal must exist.** Requested via the ENMAX
   ServiceNow "App Registration Request" catalog item (ticket raised
   2026-08). Until it's provisioned, this pipeline cannot run at all.
2. **A client secret must be added to the App Registration.** The
   ServiceNow-guided flow only sets up a Federated Credential by default
   — a plain client secret is a separate manual step (Entra ID → the App
   Registration → Certificates & secrets → New client secret), needed
   because this pipeline uses secret-based auth, not OIDC (see ADR-0033
   for why, and the tradeoff accepted).
3. **RBAC: Contributor on `RG-ENMAX-COR-UW2-INV2SP-P`, granted to the
   SPN's Client ID** — narrowest scope that supports the full Bicep
   deployment (see ADR-0033's "RBAC scope for the SPN" section for why
   this is deliberately narrower than a human operator's rights, and what
   it will NOT be able to do later).
4. **GitHub Environment `production`** must exist (repo Settings →
   Environments → New environment), with **required reviewers**
   configured — this is the actual approval gate; the workflow's
   `environment: production` on the `deploy` job only enforces whatever
   protection rules that environment has.
5. **4 environment secrets** on the `production` environment (Settings →
   Environments → production → Environment secrets, **not** repository
   secrets):
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID` (prod: `06c8e4ce-3403-4f63-922d-cf7ff3d9abc2`)
6. **Key Vault secrets seeded separately, manually.** This pipeline does
   *not* set `fileShareServiceAccountPassword`/`digestEmailTo`/
   `alertEmailTo` — run `./scripts/Set-KeyVaultSecrets.ps1 -Environment prod`
   yourself, via your own PIM-elevated session, before or after the
   pipeline's first run (see ADR-0033's Consequences).

## Running it

1. Actions tab → "Deploy to Production" → Run workflow.
2. Type the literal word `deploy` in the confirm box (a cheap safeguard
   against an accidental click — separate from, and in addition to, the
   environment approval gate).
3. Leave `whatIfOnly` unchecked for a real deploy, or check it to only run
   the `plan` job's what-if preview and stop.
4. The `plan` job runs immediately (no approval needed) and prints the
   real `az deployment group what-if` diff — **read it** before approving
   the next step.
5. The `deploy` job waits for a required reviewer to approve the
   `production` environment, then runs `Deploy-Infrastructure.ps1 -Force`
   followed by `Deploy-Workflows.ps1 -Force` — the same scripts and same
   safety behavior (built-in what-if-before-apply, post-deploy health
   verification) as a local PIM-driven run.

## What it deliberately does NOT do

- Enable the scheduled trigger (`SCHEDULED_TRIGGER_ENABLED`) — prod ships
  with this off by design ([ADR-0009](../decisions/0009-production-sizing-staged-golive.md)).
  Run `./scripts/Enable-Triggers.ps1 -Environment prod -Enabled $true`
  yourself, after independently verifying the deployment (see
  [`runbook.md`](runbook.md)'s golden rule about never trusting a deploy
  script's immediate health report).
- Flip `enableHardening` to `true` in `infra/params/prod.bicepparam` — a
  deliberate, separate decision. If/when it happens, the very next
  pipeline run will fail on the `rbac` Bicep module specifically (the
  SPN's Contributor-only rights don't include role-assignment
  capability) — expected, not a bug; that one grant should be applied by
  a human via their own PIM session, per ADR-0033.
- Seed Key Vault secret values (see prerequisite 6 above).

## Runner

Runs on `ubuntu-latest-enmax-corp` (ENMAX's primary VNET-injected runner
group), not a public GitHub-hosted runner — required for reaching prod's
private-endpoint-secured resources, per the org's runner guidance.
