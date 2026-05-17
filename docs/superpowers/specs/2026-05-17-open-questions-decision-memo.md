# Open Questions Decision Memo — Phase 1 Sign-Off

**Date:** 2026-05-17
**Author:** Engineering (Claude Code assist)
**Status:** Closed — all 7 decisions signed off 2026-05-17 by Rahul Akmol
**Source:** `PRD-and-Architecture.md` v1.5 Final, section 26.3 (Q1–Q7)

## Purpose

The PRD lists seven open questions that must be resolved before development begins. This memo proposes a recommended answer for each, with rationale, risk-if-wrong, and decision owner. Sign-off on these answers unblocks the Phase 1 build.

Two questions (Q6, Q7) are hard gates: no Code App without the environment toggle on, no UAT without licensing. The remaining five can be resolved in parallel.

---

## Q1 — Connection-reference vs environment-variable prefix

**Question:** Does connection-reference prefix `enmax_connref` satisfy intent, or must both environment variables and connection references use `enmax_envar`?

**Recommendation:** Use distinct prefixes — `enmax_connref_*` for connection references and `enmax_envar_*` for environment variables.

**Rationale:**
- Connection references and environment variables are different Power Platform constructs with different deployment semantics (conn refs require interactive auth at import; env vars do not).
- Distinct prefixes make solution-aware diffs, audit logs, and CD pipeline filters readable at a glance.
- Microsoft's ALM Accelerator and Power Platform CLI tooling both treat these as separate component types; sharing a prefix offers no benefit and obscures intent.

**Risk if wrong:** Low. Renames are mechanical pre-launch; post-launch renames are breaking (solution upgrade replaces components by unique name).

**Decision owner:** Solution architect (Rahul) + Power Platform admin.

**Blocks:** Repo scaffold, solution `solution.xml`, every connector reference, every flow that consumes a conn ref.

---

## Q2 — Teams bot 1:1 adaptive card delivery

**Question:** Is the Power Automate bot approved to deliver 1:1 adaptive cards to every Approvers/Admins team member's personal chat?

**Recommendation:** Confirm with IT (Nathan Relke). If blocked, fall back to: adaptive card posted to a private Teams channel (`#gen-drawings-approvals`) with @mentions, plus email and in-app notification unchanged.

**Rationale:**
- 1:1 flow bot messaging requires the `Microsoft Teams flow bot` to be permitted by tenant Teams app policy. Many enterprise tenants restrict this by default.
- If permitted, 1:1 delivery is preferred UX — approvers act from their personal chat without channel noise.
- Channel fallback delivers the same adaptive card payload (same Power Automate "Post adaptive card" action, different target), so flow-side code does not branch significantly.

**Risk if wrong:** Medium. If we design for 1:1 and tenant blocks it, approvals stall until users find the email or in-app notification. Mitigated by the three-channel design (email and in-app are unaffected).

**Decision owner:** IT Admin (Nathan) + Teams admin.

**Blocks:** Notification flow design, but not start of development — flows can be built against 1:1 target and re-pointed at a channel target in one action change.

---

## Q3 — SharePoint `Sites.Selected` scope

**Question:** Should the service account's `Sites.Selected` permission scope cover only the Generation Drawings site, or a wider Generation tenant area for future use?

**Recommendation:** Generation Drawings site collection only. Least privilege.

**Rationale:**
- `Sites.Selected` is granted per site collection. Expanding scope later is a single Graph API call; narrowing scope after a breach is much harder politically and operationally.
- Phase 1 functional requirements only touch Generation Drawings. Phase 2 hooks (out of scope) can request additional grants when they arrive.
- A narrower scope reduces blast radius if the service account credential is ever compromised.

**Risk if wrong:** Low. Phase 2 scope expansion is a documented runbook step, not a code change.

**Decision owner:** SharePoint admin + Security.

**Blocks:** Runbook #004 (SharePoint provisioning). Does not block code start.

---

## Q4 — Dataverse region

**Question:** Confirm developer-tenant region for Dataverse (geo endpoint for seed scripts).

**Recommendation:** Canada Central (geo code `can`, endpoint pattern `https://<org>.crm3.dynamics.com`). Pin as `DATAVERSE_GEO=can` env var consumed by seed scripts and CLI tooling.

**Rationale:**
- ENMAX is headquartered in Calgary; Canada Central is the standard regional default for ENMAX Microsoft 365 workloads and data residency posture.
- Dataverse Web API endpoints vary by region; hardcoding the wrong endpoint causes seed scripts to fail with 404 or auth errors that are slow to diagnose.
- Pinning as an env var (not hardcoded) means dev/UAT/production can override per-environment without code change.

**Risk if wrong:** Low and self-correcting — first seed script run will fail loudly with a region mismatch error.

**Decision owner:** Power Platform admin (confirm actual region in Power Platform Admin Center → Environments).

**Blocks:** Seed scripts, deploy pipelines. Quick to verify (<5 minutes via Admin Center).

---

## Q5 — Email-from address

**Question:** Confirm email-from address: shared mailbox `gen-drawings@enmax.com` (spec assumption) or service account itself?

**Recommendation:** Shared mailbox `gen-drawings@enmax.com`. Grant the service account `Send As` permission on the mailbox.

**Rationale:**
- Recognizable sender address improves user trust and reply-to discoverability — replies land in a shared inbox monitored by Heather/PBK rather than a no-reply service account no one watches.
- Standard Microsoft 365 pattern for Power Automate flows: service account authenticates, sends as shared mailbox. Native support in `Send an email (V2)` action.
- Service-account-as-sender (e.g., `eec_pwrplat_svc@enmax.com`) reads as machine-generated and is more likely to trigger user spam filters.

**Risk if wrong:** Low. Reversing this is a one-line change in each email child flow.

**Decision owner:** Exchange admin (grant `Send As`) + Heather (confirm mailbox ownership and monitoring).

**Blocks:** Email child flows (3 of 16 flows). Does not block other tracks.

---

## Q6 — Power Apps Premium licensing model

**Question:** Per-user Premium or per-app licensing for ~70 active + ~600 search-only users?

**Recommendation:** Hybrid.
- **End users (~670):** Per-app Premium for the Code App (`Drawing Numbering`).
- **Admin trio (Heather, PBK, +1 backup):** Per-user Premium (covers both Code App and model-driven admin app, plus future apps).
- **Approvers (~10):** Per-app Premium for the Code App; admin model-driven app use is approval-only and can be done via Dataverse direct or absorbed into Code App approval surface.

**Rationale:**
- **Cost comparison (list prices, USD):**
  - Per-user Premium at $20/user/month × 670 = ~$13,400/month = ~$160K/year.
  - Per-app at $5/user/app/month × 670 = ~$40K/year for one app.
  - Hybrid: ~670 × $5 + 3 × $20 = ~$3,410/month = ~$41K/year.
- Per-app is purpose-built for "one app, many users" scenarios like this one.
- Admin trio needs per-user because they cross the Code App / model-driven app boundary regularly and may absorb additional Phase 2 apps.
- ENMAX-specific volume discounts via Enterprise Agreement may change the math — final number is for procurement to confirm, but the model (per-app for end users) is correct regardless.

**Risk if wrong:** High operationally — under-licensing means users see auth errors at first app open. Over-licensing is a budget conversation, not a launch blocker.

**Decision owner:** IT procurement + Microsoft licensing partner.

**Blocks:** UAT release gate. Does not block dev-tenant build (developer tenant has built-in licensing).

---

## Q7 — `Enable code apps` environment toggle

**Question:** Is `Enable code apps` toggle ON in both dev and ENMAX UAT tenants?

**Recommendation:** Verify both tenants immediately. If OFF in UAT, request enable as Day 0 ticket — this is a Power Platform Admin Center toggle, requires Power Platform Admin role.

**Rationale:**
- Code Apps are a preview/GA feature gated by tenant + environment policy. Without the toggle, the entire `@microsoft/power-apps` SDK approach fails — `power-apps run` and `power-apps push` both return policy-violation errors.
- No technical workaround exists; the whole Phase 1 frontend strategy depends on this.
- Dev tenant likely already has it (PRD assumes so), but UAT tenant on ENMAX side is the unknown.

**Risk if wrong:** Critical — if UAT toggle is unobtainable, the Code App approach is dead and the project pivots to a canvas app or model-driven app, which is a complete frontend rewrite.

**Decision owner:** Power Platform admin (both tenants).

**Blocks:** UAT deployment. Does not block dev-tenant build if dev toggle is already on.

---

## Summary Table

| # | Question | Recommended Answer | Decision Owner | Blocks |
|---|----------|--------------------|----|---|
| Q1 | Conn-ref prefix | `enmax_connref_*` separate from `enmax_envar_*` | Solution architect + PP admin | Repo scaffold |
| Q2 | Teams 1:1 bot | Confirm; fallback to private channel | Nathan / Teams admin | Notification UX (not start) |
| Q3 | SharePoint scope | Generation Drawings site only | SP admin + Security | Runbook #004 |
| Q4 | Dataverse region | Canada Central (`can`) | PP admin | Seed scripts |
| Q5 | Email-from | Shared mailbox with `Send As` | Exchange admin + Heather | Email flows |
| Q6 | Licensing | Hybrid: per-app users, per-user admins | Procurement | UAT release |
| Q7 | Code apps toggle | Verify both tenants ON | PP admin (both) | UAT deploy (critical) |

## Decision Tracking

| # | Status | Decision | Decided By | Decided On |
|---|--------|----------|----|----|
| Q1 | Closed | Separate prefixes: `enmax_connref_*` for connection references, `enmax_envar_*` for environment variables | Rahul Akmol | 2026-05-17 |
| Q2 | Closed | Approved — proceed with 1:1 adaptive card delivery to personal Teams chat | Rahul Akmol | 2026-05-17 |
| Q3 | Closed | Generation Drawings site collection only (`Sites.Selected` least privilege) | Rahul Akmol | 2026-05-17 |
| Q4 | Closed | Canada Central (`DATAVERSE_GEO=can`) for dev + UAT | Rahul Akmol | 2026-05-17 |
| Q5 | Closed | Shared mailbox `noreply-autocad@enmax.com` (prod/UAT) and `noreply-autocad@tqnonline.onmicrosoft.com` (dev tenant), service account granted `Send As` on each | Rahul Akmol | 2026-05-17 |
| Q6 | Closed | Per-user Premium for all users (admins, approvers, end users, search-only) | Rahul Akmol | 2026-05-17 |
| Q7 | Closed | `Enable code apps` confirmed ON in both dev and UAT tenants | Rahul Akmol | 2026-05-17 |

## Override Notes

- **Q5:** PRD-assumed mailbox `gen-drawings@enmax.com` superseded by per-environment `noreply-autocad@*` addresses. Implication: outbound emails are no-reply; users must follow in-app/Teams call-to-action links instead of replying to email. Update notification flow child-flow templates to remove any "reply to this email" copy. Add explicit "Do not reply — open the app to respond" line to every email template (Appendix I).
- **Q6:** Hybrid licensing recommendation (~$41K/yr) overridden in favour of per-user Premium for all (~$160K/yr list price). Trade-off accepted: higher operational cost in exchange for simplicity, future Phase 2 app coverage, and no per-user app-license bookkeeping. Procurement to confirm Enterprise Agreement discount.

## Next Step

Once Q1, Q4, Q6, Q7 are decided, repo scaffold (plan #01) can begin. Q2, Q3, Q5 can decide in parallel with development; their answers land in `App Configuration` table or flow connector config without rework.

Proceed to plan A: spec the Phase 1 cut-line and write plan #01 (repo scaffold).
