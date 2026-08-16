# INV2SP — AP Invoice → SharePoint Integration

**Classification:** Confidential · **Cost Centre:** 36027 · **Project:** CORP-SharePoint-Integrations

## What this does

Every day, AP invoice files land on an on-premises network file share
(`AP_Invoice_LogicApp_Integration`). This integration copies each new file to
a SharePoint Online document library, reliably and without duplicates, using
an Azure Logic App Standard workflow that reaches the on-premises share
through the existing on-premises data gateway.

It runs on three cadences:

- **Scheduled poll** — every 15 minutes, all day, checking for new files.
- **On-demand** — triggered manually (via script) when someone wants an
  immediate copy pass, e.g. after fixing an upstream issue.
- **Daily digest** — every morning at 07:00 America/Edmonton, a summary
  email of the last 24 hours goes to finance/accounting: how many invoices
  were detected, filed successfully, already on file, or need attention,
  plus a full per-file CSV attachment.

Failures are handled with a bounded retry-and-abandon model (see
[`../design/engine.md`](../design/engine.md)), and three independent
monitoring layers make sure a problem is never silent (see
[`../design/monitoring.md`](../design/monitoring.md)).

## At a glance

| Component | What it is |
|---|---|
| `wf-copy-invoices` | The shared engine — lists the source folder, dedups, copies, classifies failures. Every trigger calls this one workflow. |
| `wf-scheduled-copy` | Recurrence trigger (15 min), gated by an app-setting kill-switch. |
| `wf-ondemand-copy` | HTTP-triggered manual run, also fires an immediate scoped digest for that run. |
| `wf-daily-digest` | 07:00 daily recurrence, rolling 24h summary + CSV. |
| `wf-run-digest` | Builds a digest scoped to one specific run (used by `wf-ondemand-copy`). |
| `wf-send-digest-email` | Shared HTML template + send logic — the only place the digest's branding lives, called by both digest workflows so they always render identically. |

## State model

Three Azure Tables track state (a fourth, `FileRunEvents`, is a pure audit
log — see [`../design/audit-trail.md`](../design/audit-trail.md)):

| Table | Grain | Purpose |
|---|---|---|
| `ProcessedFiles` | One row per distinct file (upserted) | Dedup + current status (Succeeded/Failed/Abandoned) |
| `RunLog` | One row per run | Run-level counters and outcome, for `runsExecuted`/`runsWithIssues` |
| `AlertState` | One row (global) | Cooldown tracking for immediate failure alerts |
| `FileRunEvents` | One row per (file × run) outcome | Durable per-file-per-run audit trail — which run identified/copied/skipped/failed which file |

## Environments

| | Dev / UAT / QA | Production |
|---|---|---|
| Resource group | `RG-ENMAX-COR-UW2-INV2SP-T` | `RG-ENMAX-COR-UW2-INV2SP-P` |
| Subscription | `ENMAXCORSB001D` | `ENMAXCORSB001P` |
| Region | `westus2` | `westus2` |

Dev's pre-existing resources (deployed manually before this repository
existed) are **adopted as-is** rather than recreated — see
[ADR-0001](../decisions/0001-adopt-dev-resources-as-is.md). Production is
genuinely greenfield.

## Where to go next

- **Extending or modifying the engine?** Start with
  [`../design/engine.md`](../design/engine.md).
- **Something's not working?** Start with
  [`../operations/runbook.md`](../operations/runbook.md).
- **Wondering why something was built a certain way?** Check the ADR index
  at [`../decisions/README.md`](../decisions/README.md).
- **Running a deployment or admin script?**
  [`../operations/scripts-reference.md`](../operations/scripts-reference.md).
