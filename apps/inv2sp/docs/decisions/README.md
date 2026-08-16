# Architecture Decision Records — INV2SP

Individual, numbered decision records for this project (per the documentation
format decision below — ADR-0032). Each ADR is immutable once written;
if a decision changes, a **new** ADR supersedes the old one and both remain
in the log (nothing is deleted, per ADR-0032's "no history dropped, per-ADR"
policy — this differs from `PLAN.md`, which is a gitignored, working
session log, not a permanent team artifact).

| # | Title | Status |
|---|---|---|
| [0001](0001-adopt-dev-resources-as-is.md) | Adopt dev resources as-is rather than recreate | Accepted |
| [0002](0002-email-transport-o365-delegated-auth.md) | Email transport: O365 Outlook connector, delegated auth | Accepted |
| [0003](0003-dedup-state-external-table.md) | Dedup state: external Azure Table, source file untouched | Accepted |
| [0004](0004-sharepoint-office365-connections-v2.md) | SharePoint/Office365 connections recreated as V2 | Accepted (supersedes part of 0001) |
| [0005](0005-gateway-connection-accesspolicy-exception.md) | Gateway-linked connection accessPolicy exception | Accepted |
| [0006](0006-vnet-route-all-disabled.md) | `vnetRouteAllEnabled` disabled for gateway egress | Accepted |
| [0007](0007-networking-ownership-parameterized-ids.md) | Networking ownership via parameterized resource IDs | Accepted |
| [0008](0008-sharepoint-auth-model.md) | SharePoint auth model: delegated OAuth, service accounts | Accepted |
| [0009](0009-production-sizing-staged-golive.md) | Production plan sizing and staged go-live | Accepted (mechanism superseded, see 0016) |
| [0010](0010-dedicated-monitoring-telemetry.md) | Dedicated App Insights + Log Analytics per environment | Accepted |
| [0011](0011-three-layer-monitoring-architecture.md) | Three-layer monitoring architecture | Accepted |
| [0012](0012-alert-dimension-splitting.md) | Alert dimension splitting by workflowName | Accepted |
| [0013](0013-recipient-config-via-keyvault.md) | Recipient/config management via Key Vault secret | Accepted |
| [0014](0014-cicd-deployment-identity-model.md) | CI/CD and deployment identity model | Accepted (supersedes original OIDC assumption) |
| [0015](0015-rbac-scope-deploying-identity.md) | RBAC scope for the deploying identity | Accepted |
| [0016](0016-workflow-topology-shared-engine.md) | Workflow topology: shared engine + gated trigger workflows | Accepted (amended — file-trigger workflow removed) |
| [0017](0017-dedup-key-design.md) | Dedup key design: base64 identity tuple, not a hash | Accepted |
| [0018](0018-retry-abandonment-state-machine.md) | Retry/abandonment state machine | Accepted |
| [0019](0019-error-taxonomy.md) | Error taxonomy (11 categories) | Accepted (v1, expected to evolve) |
| [0020](0020-alert-suppression-cooldown.md) | Alert suppression: state-transition + cooldown | Accepted |
| [0021](0021-deadmans-switch-threshold.md) | Dead-man's-switch threshold: PT6H | Accepted |
| [0022](0022-digest-shared-rendering-workflow.md) | Digest architecture: shared rendering workflow | Accepted |
| [0023](0023-fileRunEvents-audit-trail.md) | FileRunEvents: per-file-per-run audit trail | Accepted |
| [0024](0024-content-type-patching-removed.md) | Content-type patching removed from the engine | Accepted (functional regression, documented) |
| [0025](0025-digest-content-depth-and-cadence.md) | Digest content depth, cadence, and always-send policy | Accepted |
| [0026](0026-recurrence-trigger-timezone.md) | Recurrence trigger timezone: Windows TZ IDs, not IANA | Accepted |
| [0027](0027-triggeredbyworkflow-tracking.md) | `TriggeredByWorkflow` tracking | Accepted |
| [0028](0028-fileRunEvents-retention-cleanup.md) | `FileRunEvents` retention/cleanup tooling | Accepted |
| [0029](0029-two-service-account-identities.md) | Two separate service-account identities | Accepted |
| [0030](0030-sharepoint-site-library-targets.md) | SharePoint site/library targets (dev/prod) | Accepted (prod path unconfirmed) |
| [0031](0031-digest-escalation-contact.md) | Digest escalation contact | Accepted |
| [0032](0032-documentation-format-and-granularity.md) | Documentation format and ADR granularity | Accepted |
| [0033](0033-github-actions-prod-deployment-spn.md) | GitHub Actions production deployment via SPN | Accepted (amends 0014, cannot run yet) |
| [0034](0034-archive-successfully-copied-files.md) | Archive successfully-copied files (subflow `wf-archive-file`) | Accepted, amends 0003 (blocked by external file-share permission) |

## Known open items (not decisions — tracked here so they aren't lost)

- **Prod SharePoint target folder** — the exact path was never successfully
  confirmed (message garbled in transit, see ADR-0030). Do not deploy prod
  against the original assumed path without re-confirming.
- **Prod deployment pipeline** — cannot run yet, SPN not provisioned (see
  ADR-0033 and [`../operations/known-issues.md`](../operations/known-issues.md)).
- **Archive folder permissions** — write/delete access on `LogicAppTest`
  and `/Archive` not yet granted to the file-share service account (see
  ADR-0034). The subflow is built and ready but every real attempt
  currently fails cleanly with a `403 Forbidden` (absorbed, non-fatal).
- **FAILED digest health-badge variant** — not yet exercised with a genuine
  abandoned file (OK and DEGRADED have both been seen live).
