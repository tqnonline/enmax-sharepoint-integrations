# Known issues and open items

This page exists so genuinely open items are never silently forgotten.
When one of these is resolved, move it to the appropriate ADR/design doc
and remove it from here — don't just delete it without a trace.

## Blocking production readiness

### Production SharePoint target folder is unconfirmed
The exact production destination path was never successfully confirmed —
a message specifying it was garbled in transit and never resent. **Do not
deploy production against the original `/sites/AP/P` "Accounts Payable"
assumption** ([ADR-0030](../decisions/0030-sharepoint-site-library-targets.md))
without re-confirming directly with the business owner first. This is the
single most important open item before a safe production go-live.

### Prod deployment pipeline cannot run yet - SPN not provisioned
[ADR-0033](../decisions/0033-github-actions-prod-deployment-spn.md)'s
`.github/workflows/deploy-prod.yml` is built and lint-clean, but genuinely
cannot execute yet: the service principal it authenticates as does not
exist (App Registration Request raised via ServiceNow, ticket pending as
of this writing), the GitHub `production` environment/required-reviewer
rule and its 4 environment secrets haven't been configured, and the SPN
still needs a Contributor role assignment on
`RG-ENMAX-COR-UW2-INV2SP-P` plus a manually-added client secret (the
ServiceNow-guided flow only provisions a Federated Credential by default
- see [`cicd.md`](cicd.md)'s prerequisites list for the complete setup
checklist). None of this can be verified live until the ticket resolves.

## Design gaps, not yet resolved

### No reconciliation between `ProcessedFiles` and live SharePoint state
If a file is deleted from SharePoint after being marked `Succeeded` in
`ProcessedFiles`, the engine has no mechanism to detect this — dedup is
one-way. The file will never be re-copied, even though it's genuinely
missing from the destination. Not yet decided whether periodic
reconciliation is worth building, or whether this risk is accepted as-is.
See [ADR-0003](../decisions/0003-dedup-state-external-table.md).

### Source share grows without bound
Files are never deleted or archived from the source share after a
successful copy ([ADR-0003](../decisions/0003-dedup-state-external-table.md)).
The digest's distinct-file accounting
([ADR-0023](../decisions/0023-fileRunEvents-audit-trail.md)) prevents this
from inflating headline *counts* incorrectly, but the underlying share
itself is not pruned by this integration — that's a business-owned
process, out of scope here, worth surfacing if the backlog ever becomes
operationally noticeable.

### Content-type stamping is not functionally active
`Patch_Content_Type` was removed entirely
([ADR-0024](../decisions/0024-content-type-patching-removed.md)) after
repeated SharePoint 400 errors. Files land with whatever the destination
library's default content type is. Reopening this requires SharePoint
site/library configuration work first (enabling content-type management
on the library and adding the `Enmax Document` content type to it) —
not something fixable from this codebase alone.

## Tooling gaps

### `Deploy-Workflows.ps1`'s post-deploy health check is not fully trustworthy
It can report `Healthy` immediately after a deploy that is, in fact,
broken — the runtime doesn't always finish validating a new definition
within the script's built-in wait. See
[the runbook](runbook.md#golden-rule-never-trust-a-deploy-scripts-immediate-health-report)
for the standing manual-reverification discipline this created. Not yet
hardened in the script itself (e.g. a longer wait, or an explicit
version-id comparison before/after).

### `secureData` masking discrepancy, unexplained
While diagnosing a SharePoint field-level error, a `Patch_Content_Type`
action's live response showed **only `inputs`** as actually secured,
despite `runtimeConfiguration.secureData.properties` listing `outputs` as
secured too. Not confirmed as intended platform behavior or a genuine
bug — worth rechecking before relying on `secureData` configuration to
fully mask a field in a live response.

## Not yet exercised / confirmed

- The branded digest email has been verified live at the data/pipeline
  level (correct numbers, correct CSV, correct send) but **not yet
  visually confirmed by a human in an actual inbox**.
- The DEGRADED/FAILED digest health-badge template variants have not yet
  been exercised with a genuine failure or abandoned file — only the OK
  (all-clear) variant has been seen live.

## Process items, not decisions

- Phase 5 GitHub Actions: the prod deployment pipeline exists
  (`deploy-prod.yml`, [ADR-0033](../decisions/0033-github-actions-prod-deployment-spn.md),
  amending [ADR-0014](../decisions/0014-cicd-deployment-identity-model.md)'s
  original "PR validation only" scope) but cannot run yet (see above). PR
  validation workflows (Bicep build/lint/what-if, PSScriptAnalyzer,
  Pester on every PR) are still not built.
- `AZURE_CLIENT_SECRET` rotation reminder: once the SPN and its client
  secret exist, whoever owns `deploy-prod.yml` needs a process for
  rotating that secret before it expires (Entra ID app registration
  secrets have a fixed expiry) — the OIDC/federated-credential path this
  project deliberately did not choose would not have needed this at all
  (see ADR-0033).
- A reviewer/security pass on the Phase 4 branch before it merges to
  `dev`.
- The sibling prototype repo (`tqnonline/enmax-apinvoice-integration`)
  should probably be archived to prevent future collision/confusion — a
  recommendation noted, not yet actioned.

## Prod recipient lists — no default exists, confirm with the business at deploy time

Recipient lists (`digestEmailTo`/`alertEmailTo`) are never hardcoded
anywhere in this repository — `Set-KeyVaultSecrets.ps1` only prompts
interactively at deploy time (see
[`scripts-reference.md`](scripts-reference.md#set-keyvaultsecretsps1)), by
design (dev/UAT test recipients and real production business
stakeholders are expected to genuinely differ, not mirror each other
automatically).

**Confirmed live (2026-08-14): `RG-ENMAX-COR-UW2-INV2SP-P` contains zero
resources** — prod has never been deployed at all, matching the README's
Phase 6 "Blocked" status. There is no prod Key Vault yet, so there is
nothing to seed a recipient list into today.

**When prod is eventually deployed**, confirm the real recipient list
with the business rather than assuming it should mirror dev — but
specifically consider including `czhu@enmax.com` in prod's `digestEmailTo`
(added to dev's list on 2026-08-14 at the user's request, for the daily
digest and on-demand digest emails only — explicitly **not** added to
`alertEmailTo` or the Azure Monitor Action Group's failure-alert
recipients, which stay as originally configured).

