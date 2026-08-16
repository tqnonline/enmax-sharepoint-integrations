# ADR-0033: GitHub Actions production deployment via SPN

**Status:** Accepted — amends ADR-0014
**Date:** 2026-08

## Context

[ADR-0014](0014-cicd-deployment-identity-model.md) established that GitHub
Actions would be PR-validation-only, never an unattended deploy, because
no App Registration/service principal existed for this project and the
tenant's PIM/MFA activation model is inherently interactive. That
constraint has now changed: an App Registration Request has been
submitted through ENMAX's approved ServiceNow process (per the org's
"Technology Standards" deployment guide), which will provision a service
principal specifically for deploying this project's Azure resources from
GitHub Actions.

Three things needed deciding, since the org's own standard deviates from
(or leaves open) each of them:

1. **Auth method.** The ServiceNow request's own guided flow provisions a
   Federated Credential by default (OIDC — no stored secret), and the
   org's documented best practice explicitly says "Prefer federated
   credentials over stored secrets when possible." The user chose to use
   a stored Client ID + Client Secret instead, saved as GitHub environment
   secrets.
2. **Trigger mode.** Manual (`workflow_dispatch`) vs. automatic on merge.
3. **Scope.** Full stack (infra + workflows) vs. workflows only.

## Decision

1. **Auth: Client ID + Client Secret**, stored as 4 separate GitHub
   **environment** secrets (`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
   `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` — not repository secrets,
   scoped only to workflow runs targeting the `production` environment).
   This was an explicit, informed choice after OIDC was presented and
   recommended — accepted as a deliberate risk, not an oversight. See
   "Consequences" below for the compensating controls this requires.

   **Correction made while implementing this (verified against
   `azure/login`'s actual `action.yml` and README, not assumed):**
   `azure/login` has no `client-secret` input at all — only `client-id`,
   `tenant-id`, `subscription-id`, and `creds` exist. Passing
   `client-secret:` under `with:` is silently dropped (an unrecognized
   action input is not an error at parse time) and the action would then
   attempt OIDC auth using only `client-id`/`tenant-id`/`subscription-id`,
   failing at runtime once it found no `id-token` permission and no
   federated credential match — a confusing, delayed failure rather than
   a clear one. Service-principal-secret auth requires the `creds` input,
   a single JSON blob. The 4 separate secrets are inlined into that JSON
   shape at the point of use (`creds:
   '{"clientId":"...","clientSecret":"...","subscriptionId":"...","tenantId":"..."}'`)
   — the officially documented alternative to one combined
   `AZURE_CREDENTIALS` secret — preserving the original 4-separate-secrets
   request while using the action correctly. Also corrected `azure/login@v2`
   (requested version) to `@v3`: v2 is in security-fix-only maintenance
   mode per the action's own support table; v3 is current.

   **Worth noting: the org's own reference doc's YAML sample only ever
   shows `client-id`/`tenant-id`/`subscription-id` — no secret field at
   all.** That sample is actually the OIDC pattern, not a client-secret
   example. The org's documented, ServiceNow-guided flow does not cover
   client-secret auth at all (only the Federated Credential setup, steps
   1-6 of that guide) — using a stored secret requires an additional
   manual step on the App Registration (Certificates & secrets → New
   client secret) outside that guided process.
2. **Trigger: `workflow_dispatch` only**, gated by a GitHub Environment
   (`production`) configured with required reviewers — matches the org
   guide's own "Production: Manual trigger or scheduled | Required
   reviewers" row, and is especially warranted since prod currently has
   zero resources deployed (this pipeline would perform prod's first-ever
   deployment). An additional `confirm` input requiring the literal word
   "deploy" is checked in a job that runs before anything else, as a cheap
   extra safeguard against an accidental trigger click.
3. **Scope: full stack.** One pipeline runs both `Deploy-Infrastructure.ps1`
   (Bicep) and `Deploy-Workflows.ps1` (Logic App zip-deploy) — the
   existing, already-tested PowerShell scripts are called directly, not
   reimplemented in YAML. Both scripts work unmodified under an SPN
   session: `Assert-Inv2SpAzLogin` just checks `az account show` (already
   satisfied by `azure/login@v3` before the scripts run), and
   `Test-Inv2SpActiveRole` checks for an *active* Contributor/Owner/RBAC
   Administrator role assignment — an SPN with a standing (non-PIM,
   always-active) Contributor grant satisfies this the same way an
   interactively-elevated human does. **`Invoke-PimActivation.ps1` is
   never called from this pipeline** — the whole point of an SPN is a
   standing grant, not a time-bound one requiring activation.

   Structured as two dependent jobs so a reviewer can see the actual
   planned change before approving, not after: `plan` (no environment
   gate, always runs, prints `az deployment group what-if`'s real diff)
   → `deploy` (gated by the `production` environment's required
   reviewers, runs the real `-Force` deploy of both infra and workflows).

### Runner

Per the org guide's explicit table ("Deploy to Azure private
endpoints → VNET-injected runner"), this pipeline runs on
`ubuntu-latest-enmax-corp` (the primary VNET-injected runner group), not
a public GitHub-hosted runner — required because prod's Logic App/storage
sit behind private endpoints once `enableHardening=true`, and even before
that, this keeps the pattern consistent from day one rather than needing
a later runner change. `.github/actionlint.yaml` declares this and the 3
sibling ENMAX runner labels so `actionlint` (used for local/CI linting of
workflow YAML) doesn't false-positive on labels it has no way to know
about otherwise.

### RBAC scope for the SPN — deliberately narrower than a human operator's

The SPN is granted **Contributor only**, at the `RG-ENMAX-COR-UW2-INV2SP-P`
resource group scope — sufficient for the full Bicep deployment today,
because `infra/main.bicep`'s `rbac` module (which assigns Storage Table
Data Contributor to the Logic App's managed identity) is conditionally
invoked only `if (enableHardening)`
([ADR-0015](0015-rbac-scope-deploying-identity.md)), and
`infra/params/prod.bicepparam` currently has `enableHardening = false`.
Contributor does **not** include `Microsoft.Authorization/roleAssignments/write`
by design (an Azure built-in role restriction) — the SPN is deliberately
**not** granted any role-assignment capability, unlike the human-operator
RBAC request in ADR-0015 (which explicitly does need RBAC Administrator
for that one narrow purpose).

**This means: once someone later flips `enableHardening` to `true` in
prod (a separate, deliberate hardening step), a pipeline run driven by
this SPN will fail specifically on the `rbac` module** with an
authorization error — this is expected, not a bug. That one-time role
assignment should be performed by a human operator through their own
PIM-elevated session (matching how it's done in dev today), keeping the
SPN's standing rights minimal. If assigning that one role via the SPN is
ever genuinely preferred instead, it would require a narrowly
ABAC-condition-scoped User Access Administrator grant (restricted to only
the Storage Table Data Contributor role definition) — not built now,
since the simpler human-does-it-once path is lower risk and this is not
expected to be a frequent operation.

## Consequences

- **Accepted risk:** a long-lived credential (client secret) with
  Contributor rights over a Confidential-classified production resource
  group now exists in GitHub. Compensating controls: (a) stored as a
  GitHub **environment** secret scoped to the `production` environment
  only, not a repository-wide secret; (b) the `production` environment
  requires reviewer approval before any job that has access to the secret
  can run; (c) GitHub automatically redacts secret values from logs; (d)
  the SPN's own Azure-side rights are Contributor only — no role
  assignment capability, no access to other projects' resource groups.
- **Standing follow-up, not yet scheduled:** client secrets expire and
  must be rotated — unlike the OIDC path, which needed no secret
  rotation at all. Whoever owns this pipeline going forward needs a
  reminder/process for rotating `AZURE_CLIENT_SECRET` before expiry (see
  [`../operations/known-issues.md`](../operations/known-issues.md)).
- Initial Key Vault secret values (`fileShareServiceAccountPassword`,
  `digestEmailTo`, `alertEmailTo`) are **not** seeded by this pipeline —
  `Set-KeyVaultSecrets.ps1` remains interactive by design (never wants a
  secret value to pass through CI logs or non-interactive automation) and
  continues to be run manually, by a human, via their own PIM-elevated
  session, exactly as in dev. The prod pipeline assumes those secrets are
  seeded (or still placeholders, in which case monitoring/some app
  settings simply won't fully activate yet — the same graceful "not fatal
  on first bootstrap" behavior `Deploy-Infrastructure.ps1` already has for
  `alertEmailTo`).
- Once this SPN and its Federated Credential both exist (the ServiceNow
  ticket also provisions a Federated Credential by default, even though
  this pipeline doesn't use it) — the Federated Credential is available,
  unused, if this decision is ever revisited toward OIDC instead of the
  stored secret.
