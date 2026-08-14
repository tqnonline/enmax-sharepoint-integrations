# ADR-0031: Digest escalation contact

**Status:** Accepted
**Date:** 2026-08-10

## Context

The digest email needs a clear, actionable escalation path for a
finance/accounting recipient who sees a failure they need help with.

## Decision

Escalation path is a Service Desk ticket to `servicedesk@enmax.com`,
subject line "AP Invoices to SharePoint Integration Services." Both the
address and subject are environment-driven app settings
(`SUPPORT_CONTACT_EMAIL`/`SUPPORT_CONTACT_SUBJECT`), not hardcoded into
the email template, so they can be changed per environment or over time
without a workflow redeploy.

## Consequences

- Consumed inside `wf-send-digest-email`'s shared HTML template — see
  ADR-0022.
