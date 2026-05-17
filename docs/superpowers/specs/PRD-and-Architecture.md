# ENMAX Generation: AutoCAD Document Numbering System

**Master Product Requirements & Architecture Specification**

| Field | Value |
|---|---|
| Document | PRD + Architecture Specification (single source of truth) |
| Programme | Generation Drawings: Legacy CAD App Modernisation |
| Owner | Akmol Rahul (Solution Architect) |
| Business Sponsor | Heather Quinn (Document Controller, Generation) |
| Audience | Power Platform developers, IT Architecture, Generation Document Control, IT Support |
| Status | v1.5 Final (post audit) |
| Document Date | 17 May 2026 |
| Solution Publisher | Enmax Energy Corporation |
| Publisher Prefix | `enmax` |
| Choice Value Convention | All option-set values start at `1`. `0` is reserved as the default sentinel value named `None`. |
| Ownership Posture | Every Reservation row is owned by the user who requested it. Drawing, Sheet and Checkout rows inherit that ownership. |
| Target Build Tenant | Developer tenant (24-hour build) |
| Target UAT Tenant | ENMAX (post developer-tenant sign-off) |
| Scope | Phase 1: Drawings only. Standards, Procedures and Forms are explicitly deferred. |

### Revision history

| Version | Date | Notes |
|---|---|---|
| 1.0 | 17 May 2026 | Initial draft. Phase 1 drawings, single SharePoint library, two-team security. |
| 1.1 | 17 May 2026 | Sheet entity introduced (drawing has 1..N sheets, filename suffix `-sss`). Drawing-level check-out and per-drawing revision. One SharePoint library per Asset-Unit. Three teams (Users, Approvers, Admins) on a strict 1:1:1 Azure SG → Dataverse Team → Dataverse Role mapping, plus Basic User across the env. Shared mailbox for every outbound email. Teams adaptive cards delivered direct to each admin and approver (no channel). Dedicated `Enmax AutoCAD` child BU. Reservation rows owned by the requesting user. Publisher set to `Enmax Energy Corporation` with prefix `enmax`. Choice values 1-based with `0 = None`. |
| 1.2 | 17 May 2026 | SharePoint decoupled from the checkout/checkin workflow. Check-out is a Dataverse state only, with no SharePoint REST locking. No placeholder PDFs are provisioned on reservation approval. On check-in submission, the app locates files in the appropriate SharePoint library by their deterministic filename and records the URLs on the Sheet rows for hot-linking. SharePoint's native major-versioning is the authoritative version history; the app reads version metadata but does not orchestrate it. The service account's SharePoint scope drops to Read-only on the site collection. Two flows removed; one added. |
| 1.3 | 17 May 2026 | Three additions to the UX surface and one to the data model. In-app notification channel (bell icon, feed panel, per-user notification log) joins email and Teams as a peer. Admin Broadcast Messages: admins author dated, expiring messages that target Users, Approvers or Admins; recipients see them on Home and can review and dismiss. Maintenance banner: when `SingleAdminMode = true`, every authenticated user sees a non-dismissible banner explaining the app is under maintenance, with admins still operational underneath. Application footer with version, release date, disclaimer and copyright on every screen. Code App UX explicitly mirrors the Model-Driven App pattern: persistent left sidebar navigation, a horizontal command bar above each work surface, and every data grid carrying a search box, sortable columns and column-level filters. Two new Dataverse tables (`enmax_autocadbroadcast`, `enmax_autocadbroadcastdismissal`) and one new flow (`On Broadcast Created → Fan Out In-App Notifications`). |
| 1.4 | 17 May 2026 | Sequence seeding becomes explicit. Each (Business, Asset, Unit, Domain, System, Kind) combination has an admin-settable starting point on the Number Sequence row, so the dev tenant and UAT can pick up from where the legacy SQL Server left off without colliding with already-issued numbers. Format rigidity is hard-coded: drawing sequence is always 4-digit zero-padded (`0001` through `9999`); sheet sequence is always 3-digit zero-padded (`001` through `999`, with `MaxSheetsPerDrawing` capping the practical upper bound). A new Reference Data sub-destination, *Number Sequences*, lets admins inspect, seed and adjust every sequence with full audit. Approaching the 9999 ceiling on any combination raises a Warning broadcast at 9000 and a Critical broadcast at 9900. |
| 1.5 (audit) | 17 May 2026 | End-to-end quality audit pass. Section 5.3 user journey, acceptance criteria A7, A8 and A9, section 8.2 library description, the Checkout entity blurb, the Sheet `State` column note, the App Configuration table key example, F-16 channel list, the issue backlog entries #029, #030 and #031, Q2 in the open-questions section, the section 26.1 risk paragraph on Sites.Selected, and the risk on the shared admin mailbox were all rewritten to reflect the v1.2 SharePoint decoupling. The `CheckedIn` value was added to the Drawing state choice set so F-15 has a target. Acceptance criterion A14 was re-ordered to follow A13. Appendix K was added to the TOC and given its section-number prefix (`38`). One stray em dash (section 15.2 code block) became an en dash. Section 10 now opens with an explicit flow count (thirteen parent + three child = sixteen). Three flow row descriptions in section 10 now name the In-App Notification write alongside email and Teams. |
| 1.5 | 17 May 2026 | Code Apps platform grounding from Microsoft Learn. Architecture pinned to the four-layer composition: app code, `@microsoft/power-apps` SDK, `power.config.json`, and the Power Apps host. Tooling standardises on the npm-based `power-apps` CLI (`init`, `run`, `push`) replacing the now-deprecating `pac code push`. The Vite degit template from `microsoft/PowerAppsCodeApps` is the scaffold seed. Authentication and app loading are explicitly delegated to the host. A new section catalogues the hard platform limitations (no Power Apps mobile or Windows app, no Power BI data integration, no SharePoint forms, no SAS IP restriction, no Power Platform Git integration), the Power Apps Premium licensing prerequisite for every end user, the environment-level *Enable code apps* toggle, and the December 2025 Chrome/Edge local-network-access permission for embedded scenarios. The known constraint that Code Apps cannot read Dataverse environment variables is reiterated with its workaround (the App Configuration table). |

---

## Table of contents

1. Executive summary
2. Goals, non-goals and success criteria
3. Personas and population
4. Functional requirements
5. End-to-end user journeys
6. Information architecture and screen inventory
7. Data architecture: Dataverse
8. SharePoint architecture: site collection, libraries, content type and term sets
9. The numbering scheme: format, validation and concurrency
10. Automation architecture: Power Automate flows
11. Notification and approval UX
12. Security model
13. Application configuration table
14. Naming conventions and platform guardrails
15. Solution architecture and technology stack
16. UX system: Fluent UI v9 against the ENMAX brand
17. Two-app split: Code App and Administration model-driven app
18. Development workflow: Claude Code, GitHub, subagents, tests
19. CI/CD with GitHub Actions
20. Repository layout, branching and CLAUDE.md
21. Runbooks branch and manual handoffs
22. Seed data and deterministic GUID strategy
23. Test strategy
24. Acceptance criteria for Phase 1
25. Out of scope and Phase 2 hooks
26. Risks, assumptions and open questions
27. Glossary
28. Appendix A: Business taxonomy
29. Appendix B: Asset taxonomy and approved BB–AA combinations
30. Appendix C: Unit taxonomy
31. Appendix D: Domain taxonomy
32. Appendix E: Kind taxonomy
33. Appendix F: Record Type and Record Phase
34. Appendix G: System term set summary
35. Appendix H: Vendor term set summary
36. Appendix I: Email and Adaptive Card templates
37. Appendix J: Issue backlog seed (initial GitHub issues)
38. Appendix K: Authoritative Microsoft Learn references

---

## 1. Executive summary

ENMAX Generation's drawing numbering process has run for years on a custom JavaScript application backed by SQL Server, with PDFs in OpenText InfoLink, native CAD on the P: drive, and a 600-strong user community served almost entirely through one document controller. The application works. It also fails quietly in places that matter: there is no concurrency guard on number issuance, the check-in step is manual, support ownership is unclear, and a single person is the load-bearing piece of the workflow.

This specification proposes a replacement built natively on Microsoft Power Platform. Dataverse becomes the system of record for numbering, approvals and audit. SharePoint Online (with a defined content type called *Generation Drawing Information*) becomes the document repository for PDF exports. Power Automate runs every workflow and notification, including approval emails with deep links and Microsoft Teams adaptive cards. Two applications sit on top: a polished Power Apps **Code App** built with React and Fluent UI v9 for the end-user and administrator experience, and a thin **model-driven** administration app for raw data housekeeping.

The 24-hour developer-tenant build targets Phase 1 only: drawings. Standards, Procedures and Forms (and their three-digit Procedure suffix) are deferred to Phase 2; the data model accommodates them, but no UI or flow is shipped for them in this release. The native CAD files on the P: drive are out of scope: this system concerns itself only with the PDF exports that live in SharePoint Online.

The spec is opinionated about three things that the legacy system gets wrong. First, numbering must be concurrency-safe at the database layer, not at the UI layer; this is a hard architectural requirement. Second, the admin's manual upload-and-tag burden must collapse into a single user-driven submission that completes itself. Third, the application must be observable, testable and reproducible across environments, with deterministic seed data and a CI pipeline that gates merges. None of these are negotiable.

What follows is the working specification. It is detailed where detail prevents mistakes (data model, numbering, security) and sparing where it would over-prescribe craft (visual polish, error copy). It assumes the reader is a competent Power Platform engineer or architect.

---

## 2. Goals, non-goals and success criteria

### 2.1 Goals

The system shall provide ENMAX Generation with a reliable, modern, role-aware experience for reserving drawing numbers, checking PDF drawings in and out of SharePoint, searching the drawing index across every cascading metadata segment, and administering the reference data that underpins all of the above. It shall do so without manual intervention from the document controller for any step that a deterministic rule can perform.

It shall use Entra ID for authentication, Dataverse teams (driven by Azure security groups) for authorisation, a single global admin queue for approvals, and a Microsoft 365 service account (`eec_pwrplat_svc@enmax.com`) for every connection reference. It shall surface every state change in a visible audit trail. It shall be deployable across developer, UAT and production tenants from the same solution package with identical record identifiers for all seed and master data.

The end-user experience shall feel like a contemporary SaaS product, not a Microsoft form. That means real loading states, real empty states, real keyboard navigation, real focus order, real motion, and real care in typography, spacing and colour. Fluent UI v9 supplies the primitives; the brand layer comes from the design system at `design.md`.

### 2.2 Non-goals (this release)

Native CAD (.dwg) file handling, the P: drive mapping table, file locking on the file share, BO Reports, the legacy LCR Daily Report, the SPF and Site Document Power BI dashboards, the historical version viewer, mobile and offline experiences, external (non-ENMAX) access, batch number reservation beyond the documented cap of ten, automated file naming, and write-back to InfoLink. None of these are in scope. Several are explicit non-requirements from the source workbooks; the rest are deferred to Phase 2 or a separate workstream.

Standards, Procedures and Forms reservation flows (and the additional three-digit Procedure suffix for Forms) are deferred. The data model is shaped to accept them later; the UI and flows are not built.

### 2.3 Success criteria

A reservation can be raised, approved and confirmed by an end user with no intervention from the document controller beyond the approval click. A drawing PDF can be checked out, edited offline, and checked back in by an end user with the admin only validating that the upload meets revision-number expectations. Every approval and every state transition is recorded against the user who triggered it. Two simultaneous reservation requests for the same combination receive two different sequential numbers and zero retries on the client. The application loads its first interactive screen in under two seconds on a corporate laptop. The same solution package, when imported into UAT, produces an environment that is bit-for-bit identical at the schema and master-data level.

---

## 3. Personas and population

The system serves three named personas. Their needs differ in frequency, depth and tolerance.

The **Regular User** sits inside Engineering, Operations, Maintenance, Asset Management or Reliability. The active request-and-check-out population is roughly seventy named individuals; the wider read-and-search audience runs to about six hundred. Most interactions are sporadic. A user might raise a reservation once a quarter and search the index every other week. Muscle memory does not exist; the UI must reward first-encounter intuition over keyboard expertise.

The **Administrator** is Heather Quinn. PBK is her backup. Together they hold every approval, every dropdown change, every vendor addition and every check-in confirmation. The system today is, in practice, Heather. The new system must remove the work that can be removed and dignify the work that remains. Heather has been clear about three asks: automatic check-in confirmation on upload, fewer manual metadata touches, and notification mechanisms she controls.

The **IT Administrator** (Nathan Relke, Jinki Lee, Wendy Hop) owns the Power Platform environment, the Entra ID groups, the service account, the Dataverse capacity and the SharePoint site collection. They will own the application after handover. This is a meaningful change of relationship from the legacy app, which IT never properly owned. The runbooks in section 21 are written for this audience.

A fourth audience exists implicitly: the **search-only consumer** who never raises a reservation and never checks anything out. The search experience must serve them well enough that they stop using Mike's Excel report as a workaround. If the search remains slower or thinner than a spreadsheet, the new system has failed in their eyes regardless of how well the reservation workflow works.

---

## 4. Functional requirements

The requirements below are the consolidated, deduplicated and reconciled set drawn from the *Auto Cad Numbering Initial Requirements* workbook (including the March 31 clarification sheet), the *Requirements Understanding & Process Flows* document, and the *Numbering Coding Identifiers* document. Where the workbook and the clarification sheet disagree, the clarification sheet wins; both are footnoted in the table.

| ID | Area | Requirement | Notes |
|---|---|---|---|
| F-01 | Numbering | Six cascading dropdowns: Business (BB), Asset (AA), Unit (UU), Domain (DDD), System (SSS), Kind (KK). Each selection constrains the next. | The dependency chain is canonical and lives in Dataverse reference tables. |
| F-02 | Numbering | A seventh segment, the four-digit sequence `nnnn`, is generated automatically by the platform and is concurrency-safe. | See section 9. |
| F-03 | Numbering | The user may reserve one to `MaxDrawingsPerReservation` drawing numbers per submission. Each drawing carries one to `MaxSheetsPerDrawing` sheets. Defaults: 10 drawings, 50 sheets. Both caps are stored in the App Configuration table and editable by admins. | Cap of 10 confirmed in the clarification sheet, overriding the workbook's "no upper limit". The sheet dimension supersedes the original ambiguity around "Number of Sheets per Drawing". |
| F-04 | Numbering | The user may choose New Sequence or Existing Sequence. | Existing means "add to an in-flight series". |
| F-05 | Numbering | Invalid Business–Asset combinations show an error message but the user may proceed with an explicit override and a stored reason. | Soft validation with audited override. |
| F-06 | Numbering | Unused reserved numbers may be released by the requester or by an admin. | Released numbers move to a `Cancelled` state; the sequence is not reused. |
| F-07 | Approvals | Reservations require admin approval before the number is usable on a drawing. | Single global admin queue. |
| F-08 | Approvals | Approve and Decline both require the admin to act on the row; Decline requires a reason. | Reason captured to the audit trail. |
| F-09 | Approvals | Approval and decline notifications are emailed to the requester with a deep link to the record. | See section 11. |
| F-10 | Check-Out | An authenticated user can check out a Drawing via the app. The check-out is a Dataverse state change only. The user works against the SharePoint library directly (download, edit, upload a new file with the same deterministic filename). | No SharePoint REST locking. The state and the user attribution are recorded in Dataverse; SharePoint hosts the files and manages versions natively. |
| F-11 | Check-Out | The application surfaces who currently holds the check-out and for how long. The Dataverse state is the source of truth for workflow gating. SharePoint's own optimistic-concurrency on file uploads (last-write-wins on a new major version) is the only enforcement layer at the file level. | A future Phase 2 enhancement may add advisory SharePoint-side checkout. Phase 1 deliberately keeps the integration loose. |
| F-12 | Check-Out | An admin can force a check-in on behalf of a user who has left or who has held a check-out for too long. | Force action requires a typed reason and is audited. |
| F-13 | Check-Out | Stale check-outs trigger reminder notifications at 3 months, 6 months and 12 months. The 3-month reminder is the guaranteed minimum. | Power Automate scheduled flow. |
| F-14 | Check-In | A user submits a check-in by clicking *Submit revision* in the app and confirming the new drawing-level revision number. The app then scans the appropriate Asset-Unit SharePoint library for files matching the deterministic filename pattern (`BB-AA-UU-DDD-SSS-KK-nnnn-*.pdf`), records the URL of every sheet found on the corresponding Sheet row, and moves the Drawing to *Awaiting Validation*. | The user is responsible for uploading the revised files directly to the SharePoint library before clicking *Submit revision*. The app does not orchestrate the upload; it indexes after the fact. |
| F-15 | Check-In | An approver or admin validates the submission (every expected sheet present in SharePoint, revision number consistent, metadata correct). On approval the Drawing moves to *Checked In*, the recorded URLs on every Sheet row are finalised, and the drawing's revision is bumped on the Drawing row; on decline the submission is rejected with a reason and the drawing returns to *Checked Out*. | SharePoint's native major-versioning carries the version history; the app simply records the latest URL. |
| F-16 | Check-In | The user is notified on approval or decline. | Email from the shared mailbox, Teams adaptive card in 1:1 chat, and in-app notification in the bell panel. |
| F-17 | Search | Users filter by any of the six numbering segments, by free-text title, by ENMAX document number, and by vendor. Multiple selections per segment. | The dropdowns mirror the reservation form for muscle memory. |
| F-18 | Search | The result grid shows the latest version only, with the SharePoint document link, requester, last revision date, revision number and the full computed number. | Latest version only is canonical. |
| F-19 | Search | The grid supports column sort, column-level keyword filter, server-side paging and CSV export. | Export is admin-only. |
| F-20 | My Items | Each user has a personal view of their reservations and their checked-out drawings, scoped to that user. | Reservations and checkouts disappear from the view once finalised. |
| F-21 | Admin | An admin can manage the values that populate the dropdowns (Business, Asset, Unit, Domain, System, Kind), approved BB–AA combinations, Record Type, Record Phase and the Vendor list. | All values seeded; admin add is rare. |
| F-22 | Admin | An admin can manage user-to-team assignments through Entra security groups. The application does not manage group membership directly. | Section 12. |
| F-23 | Admin | An admin can override or release a stuck record. | Audit captures the override. |
| F-24 | Audit | Every state transition records `who`, `when`, `from-state`, `to-state`, `reason` and `source` (UI or flow). | Stored on the row and on a separate audit table for queryability. |
| F-25 | Security | Entra ID single sign-on. Role assignment flows from Entra security group → Dataverse team → security role. | No direct user-role assignments. |
| F-26 | Security | Row-level access: end users see their own records; admins see all. | Owner column + Business Unit + security role posture. |
| F-27 | Config | A *Single Admin Mode* global flag, stored in the App Configuration table, locks the application to admins only and grants admins a *view as end user* toggle for testing. | Section 13. |
| F-28 | Integration | PDF storage is SharePoint Online only. No P: drive integration. No InfoLink integration. | Confirmed in spec scope discussion. |
| F-29 | Reporting | No native reports in this release. The Dataverse audit table is queryable by IT for ad-hoc analysis. | Power BI deferred. |
| F-30 | Mobile | No mobile or external access. | Confirmed non-requirement. |
| F-31 | Sharing | An end user may share any record they own with another individual user or with a Dataverse team, granting read access. Admins may share or unshare on behalf of any user. | Native Dataverse share. Append, Update and Delete shares are not exposed in the UI in Phase 1. |
| F-32 | Reference data | Admins may add, edit and deactivate any reference-data row (Business, Asset, Unit, Domain, System, Kind, Record Type, Record Phase, Vendor, Asset-Unit, BB-AA combination, System Scope) self-serve. Every change writes an audit event. | No two-admin approval gate in Phase 1. |
| F-33 | In-app notifications | Every user has a notification bell in the application header. Clicking the bell opens a panel listing every in-app notification targeted at the user, with read and unread states, timestamp, severity, deep link to the relevant record, and a *Mark all as read* control. Approval results, check-in validation outcomes, stale check-out reminders and broadcast messages all surface here in addition to their email and Teams channels. | The in-app channel is a peer to email and Teams, not a replacement. |
| F-34 | Broadcast messages | Admins may author Broadcast Messages targeted at one or more of the three teams (Users, Approvers, Admins). Each broadcast carries a title, a body (markdown), a severity (Info, Warning, Critical), a start date, an expiry date, and a flag indicating whether the broadcast requires explicit acknowledgement or is dismissible. Active broadcasts appear on the Home dashboard and in the notification feed of every targeted user. Users may dismiss a broadcast they've read; dismissals are recorded per-user. Expired broadcasts disappear automatically. | The Broadcast entity and the Broadcast Dismissal entity capture this. |
| F-35 | Maintenance banner | When `SingleAdminMode = true`, every authenticated user sees a non-dismissible maintenance banner across the top of the application. The banner copy is configurable in App Configuration. End users are blocked from creating reservations, submitting revisions or invoking any state-changing action; they retain read access to their own records. Admins continue to operate normally beneath the banner. | The banner exists in addition to the broadcast system; it is not a Broadcast row. |
| F-36 | Application footer | Every screen displays a persistent footer showing the application version (semver), the release date, a short disclaimer, and the copyright notice. The version and release date are baked into the build at CI time. | Pulled from the Code App build manifest, not from Dataverse. |
| F-37 | UX pattern | The Code App's overall shell mirrors the Model-Driven App pattern: a persistent left sidebar navigation, a horizontal command bar at the top of each work surface carrying primary and secondary actions, and a consistent shell header with global search and notification bell. Every data grid in the application (Search, My Items, Approvals, Reference Data, Audit, Broadcasts) provides a quick-search input, sortable columns, column-level filters, paging and column visibility controls. | The intent is muscle-memory continuity for admins who already know Power Apps model-driven apps. |
| F-38 | Sequence seeding | For every (Business, Asset, Unit, Domain, System, Kind) combination there exists exactly one Number Sequence row carrying a `Seed Value` and a `Last Issued` value. An admin may set the `Seed Value` at any time (typically once, at legacy-migration time) and `Last Issued` is initialised to `Seed Value` on first set. The next number issued is `max(Last Issued, Seed Value) + 1`. Adjustments after the sequence has issued numbers require a typed reason and a fully-audited admin action; the new value must be greater than the current `Last Issued`. | Combinations not yet seeded behave as if seeded at `0`; the first issued number is `0001`. |
| F-39 | Sequence format | The drawing sequence `nnnn` is always 4 digits, zero-padded, valid range `0001` through `9999`. The sheet sequence `sss` is always 3 digits, zero-padded, valid range `001` through `999`. Attempts to issue beyond `9999` on any combination are rejected with a *Sequence exhausted* error and surface in a Critical broadcast to the admin team. | At 9000 the system raises a Warning broadcast; at 9900 it raises a Critical broadcast. |
| F-40 | Sequence admin surface | Admins access the Number Sequences sub-destination under Reference Data. The grid lists every active combination with `Sequence Key`, `Seed Value`, `Last Issued`, `Remaining Capacity`, and `Last Issued At`. Admins may bulk-import seed values from CSV (for legacy migration), edit individual seeds with reason capture, and inspect the audit trail for any sequence. | The CSV importer is idempotent and validated; a row whose `Seed Value` is less than the existing `Last Issued` is rejected, not silently dropped. |

### 4.1 What Phase 2 owes

Standards, Procedures and Forms reservation flows, the three-digit Procedure suffix, an admin import of historical reservation data from the legacy SQL Server, a Power BI dashboard equivalent of the LCR Daily Report, automated approver routing by Business or Asset, and any read integration with InfoLink for the duration of the document migration.

---

## 5. End-to-end user journeys

### 5.1 New drawing reservation (end user)

The user opens the application from a Teams tab or a bookmark, lands on the Home dashboard, and sees a single primary action: *Reserve a drawing number*. The flow that follows is a four-step wizard. Step one captures the record type (Drawing). Step two captures the cascading metadata in six dependent fields, with inline validation, a real-time preview of the composed number ending in `nnnn`, and a *Why is this disabled?* affordance on any locked dropdown. Step three captures the count (one to ten) and a free-text *Reason for reservation* that propagates into the approval notification. Step four is a confirmation pane with the live preview of every number that will be issued, a *Submit for approval* button, and an *Edit* link back into the relevant step.

On submit, the application calls a Dataverse custom action that opens a serialisable transaction, locks the relevant sequence row, issues the next `nnnn` value for each requested number, writes the reservations in *Pending Approval* state, and returns the assigned numbers to the client. The client transitions to a success view and shows the assigned numbers, the request reference, and the next step ("Heather has been notified"). A Power Automate flow fires on row create and emails the admin queue with an approval-capable adaptive card, plus a fallback approval-actionable email for clients that cannot render cards.

The user returns to *My Items* later to see the approval status. On approval they receive an email; on decline they receive an email with the admin's reason and an *Edit and resubmit* deep link.

### 5.2 Approval (administrator)

The admin receives an email and a Teams adaptive card. Either surface lets them approve or decline directly. For bulk processing, they open the *Admin → Approvals* tab in the Code App, where a Fluent UI v9 data grid lists every pending reservation and check-in with full context. They can multi-select and approve a batch, or open a single row in a side panel that shows the full computed number, the requester, the reason for reservation, any soft-validation overrides and their justifications, and the resulting drawings (for check-ins).

Decline always requires a typed reason. The reason is sent to the requester verbatim. Once acted on, the row disappears from the pending grid and lands in the audit log.

### 5.3 Check-out, edit, check-in (end user)

The user navigates to *Search*, finds the drawing, opens the side panel, and clicks *Check out*. The application writes a Dataverse *Checkout* row capturing the user, the timestamp and the source; the Drawing transitions to *CheckedOut*. No SharePoint operation is invoked. The Search row updates to show the check-out state with the user's name and a *Days out* counter.

The user goes to the Asset-Unit SharePoint library directly (the app surfaces the library URL on the Drawing side panel), downloads the existing PDFs, edits them upstream (out of the system's concern), and uploads the revised PDFs back to the same library with the deterministic filenames. SharePoint creates a new major version of each file natively.

Back in the app, the user opens *My Items → Checked out*, selects the row, and clicks *Submit revision*. A side-panel form captures the new drawing-level revision number, with the previous value pre-filled and a default increment offered. On submit, the *ENMAX AutoCAD: On Revision Submitted: Index SharePoint and Notify Approvers* flow scans the library for files matching the deterministic prefix `BB-AA-UU-DDD-SSS-KK-nnnn-*.pdf`, writes the captured URLs onto the corresponding Sheet rows, surfaces any missing sheets on the Drawing, and moves the Checkout to *Awaiting Validation*. An approval notification fans out to the approver and admin teams across the three channels.

An approver validates the submission (every expected sheet present, revision number consistent, metadata correct) and approves. The *On Checkin Approved: Finalise Drawing* flow bumps the Drawing's `Current Revision`, finalises the captured Sheet URLs as the canonical hot-links, closes the Checkout, and notifies the user. No SharePoint write occurs.

### 5.4 Search and discovery (any user)

Search is the most-used screen. The layout puts the filter panel on the left (collapsible, with a chip strip when collapsed) and the result grid on the right. The grid is virtualised for performance on tens of thousands of rows. Sorting and column-level filtering are instant. The full computed ENMAX number is prominent and copyable. Clicking the title opens the SharePoint document in a new tab. Clicking the row opens a side panel with full metadata, the check-out state, and an action menu.

Empty states, loading skeletons and zero-result help text are first-class. A user typing a partial number sees inline suggestions sourced from Dataverse with a 200-millisecond debounce.

---

## 6. Information architecture and screen inventory

The Code App's shell mirrors the Model-Driven App pattern that the ENMAX admin community already knows: a persistent left sidebar holds the navigation, a horizontal command bar above each work surface carries the primary and secondary actions, the application header runs across the top with the brand, global search, notification bell and user menu, and a persistent footer along the bottom carries the version, release date, disclaimer and copyright. This layout is consistent across every destination, so a user who learns the Reservation wizard immediately knows how to navigate the Search grid and the Approvals queue.

Every data grid in the application (Search, My Items, Approvals, Reference Data, Audit, Broadcasts) shares the same affordances: a quick-search input at the top-left of the grid, sortable columns, column-level filter chips, page-size selector, paging controls, a column-visibility menu and a CSV export button (admin-only). The grid is virtualised for performance on tens of thousands of rows.

The top-level destinations on the left sidebar are:

| Destination | Audience | Purpose |
|---|---|---|
| Home | All | Personal dashboard: recent activity, pending approvals (if admin), open check-outs, recent reservations, quick actions |
| Reserve | All | The four-step reservation wizard |
| Search | All | Filterable, virtualised grid of all drawings with metadata |
| My Items | All | Personal view of reservations and check-outs |
| Approvals | Admin | Reservation and check-in approval queues with bulk action |
| Reference Data | Admin | Browse and edit dropdown values, BB–AA combinations, Record Type, Record Phase, Vendor list, and Number Sequences (seed values, current last-issued, capacity, audit, bulk CSV import) |
| Audit | Admin | Filterable audit log |
| Broadcasts | Admin | Author, schedule, edit and retire Broadcast Messages; review per-user dismissal stats |
| Settings | All | Theme preference, notification preferences, admin-only *View as end user* toggle (when Single Admin Mode is on) |

The shell additionally exposes three persistent UI elements that live outside the navigation:

| Element | Where | Purpose |
|---|---|---|
| Notification bell | Header, right of global search | Opens the in-app notification feed panel showing approval results, validation outcomes, stale-checkout reminders, and active broadcasts targeted at the user. Unread count is badged on the bell |
| Maintenance banner | Top of viewport, above the header | Appears only when `SingleAdminMode = true`. Non-dismissible. Configurable copy from App Configuration. Visible to every authenticated user. End-user actions are gated underneath; admin actions remain available |
| Footer | Bottom of viewport, all screens | App version (semver, baked into the build), release date, disclaimer, copyright notice. Static during a session; refreshes on app reload |

Every destination renders a consistent header that shows the user's name, role, current Business Unit context, a global search, and a notifications bell. The shell honours the Fluent UI v9 light and dark themes and respects `prefers-color-scheme` with a manual override stored in user preferences.

The Administration app (model-driven) exposes raw data forms and views for every Dataverse table, scoped to the System Administrator and System Customizer roles. It is intentionally plain. It exists for emergency housekeeping, bulk reference-data corrections, and post-mortems. End users never see it.

---

## 7. Data architecture: Dataverse

### 7.1 Entity overview

The data model centres on the reservation, the drawing record and the audit trail, with reference tables for every dropdown and a configuration table for everything that Code Apps cannot reach through environment variables.

| Display name | Schema name | Purpose | Owner type |
|---|---|---|---|
| Reservation | enmax_autocadreservation | A request to issue one or more drawing numbers, each with one or more sheets | User |
| Drawing | enmax_autocaddrawing | A controlled drawing identity (one drawing number) carrying the current revision and overall state | User |
| Sheet | enmax_autocadsheet | A single PDF file belonging to a drawing (one row per sheet number, e.g. `-001`, `-002`) | User |
| Checkout | enmax_autocadcheckout | An open or closed check-out against a drawing (drawing-level state; every sheet of that drawing carries the same state) | User |
| Audit Event | enmax_autocadauditevent | Any state transition or override | Organisation |
| App Configuration | enmax_autocadappconfig | Key/value config readable by the Code App | Organisation |
| Business | enmax_autocadbusiness | BB reference values | Organisation |
| Asset | enmax_autocadasset | AA reference values | Organisation |
| Approved BB–AA Combination | enmax_autocadbusinessasset | Permitted Business–Asset pairs | Organisation |
| Unit | enmax_autocadunit | UU reference values (alphanumeric) | Organisation |
| Domain | enmax_autocaddomain | DDD reference values | Organisation |
| System | enmax_autocadsystem | SSS reference values | Organisation |
| Kind | enmax_autocadkind | KK reference values | Organisation |
| Record Type | enmax_autocadrecordtype | Document classification | Organisation |
| Record Phase | enmax_autocadrecordphase | Lifecycle state of the controlled record (IFC, IFR, As Built, …) | Organisation |
| Vendor | enmax_autocadvendor | Vendor master | Organisation |
| Asset–Unit | enmax_autocadassetunit | Permitted Asset–Unit pairs | Organisation |
| System Scoping Rule | enmax_autocadsystemscope | Per-Asset or per-Domain restrictions on System availability | Organisation |
| Number Sequence | enmax_autocadnumbersequence | Per-(Business, Asset, Unit, Domain, System, Kind) running counter for concurrency-safe issuance | Organisation |
| Notification | enmax_autocadnotification | Outbound notification log across all three channels (email, Teams, in-app) | Organisation |
| In-App Notification | enmax_autocadinappnotification | Per-user notification feed item shown in the bell panel | User |
| Broadcast | enmax_autocadbroadcast | Admin-authored message with target audience, severity, start, expiry and acknowledgement requirements | Organisation |
| Broadcast Dismissal | enmax_autocadbroadcastdismissal | Per-user record of a broadcast read or dismissed | User |

Every schema name is lowercase, prefixed `enmax_autocad`, and every column schema name is prefixed `enmax_acdn`. Global option sets (no local picklists) are used wherever a Choice column exists.

### 7.2 Key columns

What follows is the load-bearing column list. Less interesting columns (created on, created by, modified, owner, statuscode, statecode) are present on every table but not listed. Every Choice column references a global option set named `enmax_acdn_<ChoiceName>`.

**Reservation (`enmax_autocadreservation`)**

| Display name | Schema | Type | Notes |
|---|---|---|---|
| Reservation ID | `enmax_acdnreservationid` | Autonumber (`RES-{SEQNUM:00000}`) | Surfaced as the user-friendly reference in notifications |
| Record Type | `enmax_acdnrecordtype` | Choice (Drawing only in Phase 1) | Constrains the workflow |
| Business | `enmax_acdnbusiness` | Lookup → Business | Required |
| Asset | `enmax_acdnasset` | Lookup → Asset | Required |
| Unit | `enmax_acdnunit` | Lookup → Unit | Required |
| Domain | `enmax_acdndomain` | Lookup → Domain | Required |
| System | `enmax_acdnsystem` | Lookup → System | Required |
| Kind | `enmax_acdnkind` | Lookup → Kind | Required |
| Drawing Count | `enmax_acdndrawingcount` | Whole number (1..`MaxDrawingsPerReservation`) | Required; bound to App Configuration |
| Sheets Per Drawing | `enmax_acdnsheetsperdrawing` | Whole number (1..`MaxSheetsPerDrawing`) | Required; bound to App Configuration |
| Sequence Type | `enmax_acdnsequencetype` | Choice (New, Existing) | Required |
| Reason for Reservation | `enmax_acdnreason` | Multiline text (max 2000) | Required |
| Soft Validation Override | `enmax_acdnoverride` | Yes/No | Defaults No |
| Override Justification | `enmax_acdnoverridereason` | Multiline text | Required when override is Yes |
| Status | `enmax_acdnstatus` | Choice (Pending, Approved, Declined, Cancelled) | Drives state transitions |
| Decline Reason | `enmax_acdndeclinereason` | Multiline text | Required when Declined |
| Approver | `enmax_acdnapprover` | Lookup → SystemUser | Set on approve/decline |
| Approved On | `enmax_acdnapprovedon` | Date and Time | Set on approve/decline |
| Issued Numbers | `enmax_acdnissuednumbers` | Multiline text (JSON array) | The `nnnn` values issued by the action |

**Drawing (`enmax_autocaddrawing`)**

| Display name | Schema | Type | Notes |
|---|---|---|---|
| ENMAX Number | `enmax_acdnnumber` | Single line text | The full composed `BB-AA-UU-DDD-SSS-KK-nnnn` |
| Business / Asset / Unit / Domain / System / Kind | as above | Lookups | Required |
| Sequence Number | `enmax_acdnsequencenumber` | Whole number | The `nnnn` |
| Title | `enmax_acdntitle` | Single line text | Required |
| Vendor | `enmax_acdnvendor` | Lookup → Vendor | Optional |
| Vendor Document Number | `enmax_acdnvendordocnumber` | Single line text | Optional |
| Sheet Count | `enmax_acdnsheetcount` | Whole number | Number of sheets in this drawing (`1..MaxSheetsPerDrawing`); set at reservation approval and immutable thereafter in Phase 1 |
| Current Revision | `enmax_acdncurrentrevision` | Single line text | The whole-drawing revision (`A`, `B`, `01`, `02`...); all sheets carry the same value |
| Revision Date | `enmax_acdnrevisiondate` | Date | Optional |
| Record Phase | `enmax_acdnrecordphase` | Lookup → Record Phase | IFC, IFR, Record, etc. |
| Record Type | `enmax_acdnrecordtype` | Lookup → Record Type | Drawings, OEM Manuals, etc. |
| Asset Tag | `enmax_acdnassettag` | Single line text | Optional |
| SharePoint Library URL | `enmax_acdnsplibraryurl` | URL | Direct link to the Asset-Unit library that holds this drawing's sheets |
| State | `enmax_acdnstate` | Choice (None, Available, CheckedOut, AwaitingValidation, CheckedIn, Obsolete, Void) | Drives action availability; drawing-level (every sheet inherits). `CheckedIn` is the terminal post-validation state that returns the Drawing to general availability with the bumped revision |
| Owner Reservation | `enmax_acdnreservation` | Lookup → Reservation | Provenance |

**Sheet (`enmax_autocadsheet`)**

A Drawing has one or more Sheets. The Sheet table represents the physical PDF assets in SharePoint. Each row corresponds to a single file whose name follows the `BB-AA-UU-DDD-SSS-KK-nnnn-sss.pdf` convention.

| Display name | Schema | Type | Notes |
|---|---|---|---|
| Drawing | `enmax_acdndrawing` | Lookup → Drawing | Required; cascade delete |
| Sheet Number | `enmax_acdnsheetnumber` | Whole number (1..999, zero-padded to 3 on display) | The `sss` suffix |
| Filename | `enmax_acdnfilename` | Single line text | The full `BB-AA-UU-DDD-SSS-KK-nnnn-sss.pdf`; deterministic, generated by the system |
| SharePoint URL | `enmax_acdnsharepointurl` | URL | Direct link to the PDF in the Asset-Unit library |
| SharePoint Item ID | `enmax_acdnsharepointitemid` | Single line text | For REST calls |
| State | `enmax_acdnstate` | Choice (None, PendingInitialUpload, Available, CheckedOut, AwaitingValidation, Obsolete, Void) | Defaults to `PendingInitialUpload` at reservation approval. Transitions to `Available` on first successful index of a SharePoint file with the matching deterministic filename. Otherwise inherits the parent Drawing's state. The column supports future per-sheet semantics |

The composite unique key `(Drawing, Sheet Number)` is enforced by an alternate key on the table. Filenames are derived; they are stored explicitly so that audit queries can search by filename without recomputation.

**Checkout (`enmax_autocadcheckout`)**

A Checkout is drawing-scoped. Checking out a Drawing locks every Sheet under that Drawing in SharePoint simultaneously. There is at most one open Checkout per Drawing at any moment, enforced by a Dataverse alternate key on `(Drawing, Status)` where Status is the *Open* sentinel.

| Display name | Schema | Type | Notes |
|---|---|---|---|
| Drawing | `enmax_acdndrawing` | Lookup → Drawing | Required |
| Checked Out By | `enmax_acdncheckedoutby` | Lookup → SystemUser | Required; also becomes the row Owner |
| Checked Out On | `enmax_acdncheckedouton` | Date and Time | Required |
| Status | `enmax_acdnstatus` | Choice (None, Open, AwaitingValidation, ClosedApproved, ClosedDeclined, ClosedForced) | Drives reminder cadence and lifecycle |
| New Revision | `enmax_acdnnewrevision` | Single line text | What the user typed when submitting the revised drawing |
| New PDF URLs | `enmax_acdnnewpdfurls` | Multiline text (JSON) | Array of one URL per uploaded sheet (always covers every Sheet of the parent Drawing) |
| Validation Reason | `enmax_acdnvalidationreason` | Multiline text | Reason on decline or force |
| Reminder Stage | `enmax_acdnreminderstage` | Choice (None, ThreeMonth, SixMonth, TwelveMonth) | Set by the scheduled flow |
| Closed On | `enmax_acdnclosedon` | Date and Time | Set on close |
| Closed By | `enmax_acdnclosedby` | Lookup → SystemUser | Admin on force, approver or admin on validation |

**Number Sequence (`enmax_autocadnumbersequence`)**

| Display name | Schema | Type | Notes |
|---|---|---|---|
| Sequence Key | `enmax_acdnsequencekey` | Single line text (unique, indexed) | `BB-AA-UU-DDD-SSS-KK` composite, uppercase |
| Business | `enmax_acdnbusiness` | Lookup → Business | Denormalised for filter performance on the admin grid |
| Asset | `enmax_acdnasset` | Lookup → Asset | Denormalised |
| Unit | `enmax_acdnunit` | Lookup → Unit | Denormalised |
| Domain | `enmax_acdndomain` | Lookup → Domain | Denormalised |
| System | `enmax_acdnsystem` | Lookup → System | Denormalised |
| Kind | `enmax_acdnkind` | Lookup → Kind | Denormalised |
| Seed Value | `enmax_acdnseedvalue` | Whole number (0..9998) | Admin-settable starting point. Defaults to `0` for a fresh combination. The first issued number for a fresh combination is `Seed Value + 1` (so `0` seeds the sequence to start at `0001`; `500` seeds it to start at `0501`) |
| Last Issued | `enmax_acdnlastissued` | Whole number (0..9999) | Monotonic counter; never decreases. Initialised to `Seed Value` on first set; incremented atomically by the issuance plug-in |
| Last Issued At | `enmax_acdnlastissuedat` | Date and Time | Diagnostic; set on every issuance |
| Remaining Capacity | `enmax_acdnremainingcapacity` | Calculated whole number | `9999 - Last Issued` |
| Seeded By | `enmax_acdnseededby` | Lookup → SystemUser | Set on every Seed Value change |
| Seeded On | `enmax_acdnseededon` | Date and Time | Set on every Seed Value change |
| Seed Reason | `enmax_acdnseedreason` | Multiline text | Required when Seed Value is set after the row has issued numbers |
| Status | `enmax_acdnstatus` | Choice (None, Healthy, Warning, Critical, Exhausted) | Computed: Healthy when `Last Issued < 9000`, Warning when `9000..9899`, Critical when `9900..9998`, Exhausted at `9999` |

The Sequence Key has a uniqueness constraint and serves as the locking target during number issuance. See section 9. The denormalised lookups give the admin grid a fast filterable view without joining; the `Sequence Key` remains the canonical natural key for cross-environment portability of the row.

**App Configuration (`enmax_autocadappconfig`)**

| Display name | Schema | Type | Notes |
|---|---|---|---|
| Key | `enmax_acdnkey` | Single line text (unique) | Examples: `SingleAdminMode`, `MaxDrawingsPerReservation`, `MaxSheetsPerDrawing`, `StaleCheckoutMonths`, `AdminTeamName` |
| Value | `enmax_acdnvalue` | Multiline text | Stored as string; parsed by the client |
| Value Type | `enmax_acdnvaluetype` | Choice (Boolean, Integer, String, Json) | Aids parsing |
| Description | `enmax_acdndescription` | Multiline text | Human-readable note |

Every configuration value is seeded with a deterministic GUID (see section 22). The Code App reads this table at startup with a cached, polite refresh on a manual *Reload* affordance in Settings.

**Audit Event (`enmax_autocadauditevent`)**

| Display name | Schema | Type | Notes |
|---|---|---|---|
| Subject Table | `enmax_acdnsubjecttable` | Single line text | Logical name of the affected row |
| Subject ID | `enmax_acdnsubjectid` | Single line text | Affected row id |
| Event | `enmax_acdnevent` | Choice (Created, StateChanged, ApprovalGranted, ApprovalDenied, OverrideUsed, ForceCheckedIn, ConfigChanged, ReferenceDataChanged) | Closed taxonomy |
| From State | `enmax_acdnfromstate` | Single line text | Optional |
| To State | `enmax_acdntostate` | Single line text | Optional |
| Reason | `enmax_acdnreason` | Multiline text | Free text |
| Source | `enmax_acdnsource` | Choice (CodeApp, AdminApp, Flow, Action) | Provenance |
| Acted By | `enmax_acdnactedby` | Lookup → SystemUser | The principal |
| Acted On Behalf Of | `enmax_acdnactedonbehalfof` | Lookup → SystemUser | Set when service account acts on behalf |

**In-App Notification (`enmax_autocadinappnotification`)**

A row per (recipient user, event) pair, written by the same flow that emits the corresponding email and Teams adaptive card. The bell panel queries this table filtered by the current user and `Read = false`, sorted by `Created On` descending.

| Display name | Schema | Type | Notes |
|---|---|---|---|
| Recipient | `enmax_acdnrecipient` | Lookup → SystemUser | Required; also the row Owner |
| Title | `enmax_acdntitle` | Single line text | One-line summary |
| Body | `enmax_acdnbody` | Multiline text | Markdown-light; rendered in the panel |
| Severity | `enmax_acdnseverity` | Choice (None, Info, Success, Warning, Critical) | Drives the leading icon and accent colour |
| Source Event | `enmax_acdnsourceevent` | Choice (None, ReservationApproved, ReservationDeclined, CheckinValidated, CheckinDeclined, StaleCheckoutReminder, BroadcastPublished, ForceCheckin, SystemMessage) | Closed taxonomy |
| Subject Table | `enmax_acdnsubjecttable` | Single line text | The Dataverse table of the underlying record |
| Subject ID | `enmax_acdnsubjectid` | Single line text | The id of the underlying record |
| Deep Link Path | `enmax_acdndeeplinkpath` | Single line text | The Code App path the bell click navigates to |
| Read | `enmax_acdnread` | Yes/No | Defaults No |
| Read On | `enmax_acdnreadon` | Date and Time | Set when the user opens or marks read |

**Broadcast (`enmax_autocadbroadcast`)**

An admin-authored message with a defined audience and active window. The Broadcasts grid on the admin destination lets admins author, edit, schedule and retire these. A scheduled flow runs hourly to fan out new and currently-active broadcasts to the In-App Notification table for every targeted user who has not yet received them.

| Display name | Schema | Type | Notes |
|---|---|---|---|
| Title | `enmax_acdntitle` | Single line text | Shown in the bell panel and on Home |
| Body | `enmax_acdnbody` | Multiline text | Markdown-light |
| Severity | `enmax_acdnseverity` | Choice (None, Info, Warning, Critical) | Drives styling |
| Audience | `enmax_acdnaudience` | Choice (None, Users, Approvers, Admins, Everyone) | Multi-select allowed; defaults to Everyone |
| Starts At | `enmax_acdnstartsat` | Date and Time | The broadcast becomes active at this time |
| Expires At | `enmax_acdnexpiresat` | Date and Time | The broadcast disappears after this time |
| Requires Acknowledgement | `enmax_acdnrequiresack` | Yes/No | When Yes, the user must explicitly click *Acknowledge*; the broadcast is undismissible until then |
| Status | `enmax_acdnstatus` | Choice (None, Draft, Scheduled, Active, Expired, Retired) | Computed nightly, or on edit |
| Pinned | `enmax_acdnpinned` | Yes/No | When Yes, the broadcast appears at the top of the Home dashboard for every targeted user until it expires |
| Author | `enmax_acdnauthor` | Lookup → SystemUser | Set on create |

**Broadcast Dismissal (`enmax_autocadbroadcastdismissal`)**

| Display name | Schema | Type | Notes |
|---|---|---|---|
| Broadcast | `enmax_acdnbroadcast` | Lookup → Broadcast | Required |
| User | `enmax_acdnuser` | Lookup → SystemUser | Required; also Owner |
| Acknowledged | `enmax_acdnacknowledged` | Yes/No | True if the broadcast required acknowledgement and the user explicitly acknowledged |
| Dismissed On | `enmax_acdndismissedon` | Date and Time | Set when the user dismisses or acknowledges |

The composite alternate key `(Broadcast, User)` is unique; a user dismisses a given broadcast at most once.

### 7.3 Reference tables

Reference tables follow a consistent shape: `Code` (string, indexed, unique), `Display Name` (string), `Description` (string), `Status` (Choice: Active, Inactive), and `Sort Order` (whole number). Where dependencies exist, additional lookup columns express them. Examples include `Asset.Business` (each Asset is owned by exactly one Business) and `Unit.Asset` (each Unit is scoped to a specific Asset). The *Approved BB–AA Combination* table is the canonical join; it exists explicitly so that the workbook's "approved combinations" list is queryable and editable.

The *System Scoping Rule* table captures the workbook's "(applies to Cavalier only)", "(SHEPARD ONLY)", "(applies to DE9 only)" and "(for use with ARS only)" annotations. Each rule is a row with `System`, `Scope Type` (AssetOnly, DomainOnly), `Scope Value` (FK to Asset or Domain), and `Active`. The reservation wizard reads these to filter the System dropdown given the chosen Asset and Domain.

### 7.4 Relationships at a glance

A Reservation has zero or more Drawings (one per number issued). A Drawing has zero or more Checkouts (one open at most). A Drawing has exactly one current Revision (which is a column rollup, not a separate table). Every reference table has many-to-one relationships into the rows that reference it. Every action of consequence writes one or more Audit Events.

### 7.5 Indexing and performance

The Sequence Key column on Number Sequence is unique-indexed. The ENMAX Number column on Drawing is unique-indexed. The Status column on Reservation, Checkout, Drawing and Audit Event is indexed. The grid for Search and the Approvals grid both fetch with FetchXML or the Dataverse Web API using filtered, paged calls; nothing client-side filters more than a thousand rows at a time.

---

## 8. SharePoint architecture: site collection, libraries, content type and term sets

### 8.1 Site collection

A dedicated SharePoint Online site collection hosts every PDF in scope. The site name is `Generation Drawings`. The URL slug follows the ENMAX tenant naming convention (proposed: `https://enmax.sharepoint.com/sites/GenerationDrawings`; confirmed in section 26.3). Versioning is enabled across the site, content approval is disabled (Dataverse governs every approval), and search visibility is restricted to members of the three application Entra security groups.

### 8.2 One library per Asset-Unit combination

Inside the site collection, exactly one document library exists for every approved Asset-Unit combination. Library names and URL slugs follow the strict code pattern:

```
Library name : BB-AA-UU
URL slug     : BB-AA-UU
Example      : GG-CG-01  (Calgary Energy Centre, Unit 01)
```

The library description carries the friendly name (e.g. *Calgary Energy Centre, CTG, Unit 01*) drawn from the Asset and Unit reference tables. The code is the source of truth for routing; the description is for human readers browsing the site.

Every library uses the `Generation Drawing Information` content type as its primary content type, with the `Document` content type retained only for compatibility. The content type ID matches the existing tenant artefact: `0x010100C593949...30`. The column set is preserved verbatim from the existing definition: `Name`, `Title`, `ExtendedMetadata` (hidden), `MigrationHistory`, `Unit`, `Business`, `Asset (Facility)`, `Domain (Group)`, `System` (Managed Metadata), `Kind`, `Vendor Document/Drawing Number`, `Document/Drawing Title`, `Revision Number`, `Record Type`, `Revision Date`, `Record Phase`, `Asset Tag`, `DataID` and `Vendor Name` (Managed Metadata). Required-ness is set as currently observed; the application enforces required-ness at the Dataverse layer regardless.

Major versioning is enabled on every library. Minor versions are disabled (revisions are explicit and admin-validated, not implicit). The application does not orchestrate SharePoint checkout; the Dataverse `Checkout` row is the authoritative state for workflow gating, and users upload revised files directly into the library which SharePoint then versions natively.

### 8.3 Library provisioning

Library provisioning is automated. When an admin activates a new Asset-Unit combination in the reference data, a Power Automate flow (`ENMAX AutoCAD: On Asset-Unit Activated: Provision Library`) calls the SharePoint REST API under the service account to:

```
1. Create the document library BB-AA-UU with description = friendly name.
2. Bind the Generation Drawing Information content type as the primary type.
3. Configure versioning, checkout-required, and the default metadata view.
4. Apply the security-trimmed permissions that match the three Entra groups.
5. Write the library URL back into the Asset-Unit row in Dataverse.
```

The initial dev-tenant build seeds every currently-approved Asset-Unit combination from Appendix B and Appendix C, producing the full set of libraries on first deployment.

### 8.4 PDF filename convention

Every PDF file is named according to the full computed identity, including the sheet suffix:

```
Filename : BB-AA-UU-DDD-SSS-KK-nnnn-sss.pdf
Example  : GG-CG-00-ECS-AST-DD-0019-001.pdf
```

Where `nnnn` is the four-digit drawing sequence number and `sss` is the three-digit sheet number within that drawing. The filename is deterministic and computed by the application; users do not name files.

### 8.5 Term sets

Two managed-metadata term sets in the existing *ENMAX Enterprise Taxonomy* group are referenced: `Systems` and `Vendors`. The app reads these via the SharePoint REST API for the SharePoint upload step. The Dataverse `System` and `Vendor` reference tables are the source of truth for the reservation and search flows; a one-way sync flow keeps the term sets aligned with Dataverse on a scheduled cadence (Phase 2 candidate; in Phase 1 we treat the term sets as read-only and authoritative for the upload path).

### 8.6 The app indexes SharePoint, it does not orchestrate it

The relationship between the application and SharePoint is deliberately loose. SharePoint owns the files and the version history. The application owns the numbering, the workflow state and the index that maps a Drawing row to the URLs of its Sheet PDFs.

On **reservation approval**, the `ENMAX AutoCAD: On Reservation Approved` flow creates the Drawing and Sheet rows in Dataverse with the deterministic filenames pre-computed, but does **not** create placeholder files in SharePoint. The Sheet rows carry a `State = PendingInitialUpload` until the user uploads the first version.

On **first upload** or **subsequent revision submission**, the user uploads the PDFs directly to the Asset-Unit SharePoint library through the standard SharePoint UI. The files must be named with the deterministic pattern `BB-AA-UU-DDD-SSS-KK-nnnn-sss.pdf`; the app surfaces these filenames in the *My Items* and Reservation success views so the user can copy them.

When the user clicks **Submit revision** in the app, the `ENMAX AutoCAD: On Revision Submitted` flow queries the Asset-Unit library under the service account using the SharePoint Search REST API (or a filtered file listing scoped to the deterministic prefix), captures the `ServerRelativeUrl` and `EncodedAbsoluteUrl` of every matching file, and writes them onto the corresponding Sheet rows in Dataverse. The Drawing moves to *Awaiting Validation*. If any expected sheet is missing from SharePoint, the flow records the gap on the Drawing row and the approver sees it surfaced in the validation grid.

Native SharePoint major-versioning is the version system. When a user uploads a new file with the same deterministic filename, SharePoint creates a new major version automatically. The application reads `Version` and `Modified` metadata from the file but does not write them. No SharePoint check-out or check-in operation is invoked by the app.

The service account `eec_pwrplat_svc@enmax.com` requires only **Read** access to the Generation Drawings site collection. Read is sufficient for the index-and-link pattern; Write is not provisioned in Phase 1.

---

## 9. The numbering scheme: format, validation and concurrency

### 9.1 Format

The drawing identity is:

```
BB-AA-UU-DDD-SSS-KK-nnnn
```

A sheet identity (and the SharePoint filename stem) extends it with a three-digit sheet suffix:

```
BB-AA-UU-DDD-SSS-KK-nnnn-sss
```

Where:

```
BB    Two characters, alpha.      Source: Business.Code
AA    Two characters, alpha.      Source: Asset.Code
UU    One or two characters,
      alphanumeric.                Source: Unit.Code
DDD   Three characters, alpha.    Source: Domain.Code
SSS   Three characters, alpha.    Source: System.Code
KK    Two characters, alpha.      Source: Kind.Code
nnnn  Four characters, digits,
      zero-padded.                 Source: NumberSequence.LastIssued + 1
sss   Three characters, digits,
      zero-padded.                 Source: Sheet.SheetNumber (1..MaxSheetsPerDrawing)
```

The composed string is uppercase and joined with `-`. The Drawing row stores the seven primary segments and a derived `enmax_acdnnumber` column for search and display. Each Sheet row stores the eighth segment (`sss`) and the resulting filename. The PDF filename is the full eight-segment string followed by `.pdf` (e.g. `GG-CG-00-ECS-AST-DD-0019-001.pdf`).

### 9.2 Validation rules

Business and Asset combinations must exist in the *Approved BB–AA Combination* table. If they do not, the wizard shows a non-blocking error and surfaces the *Use anyway with reason* override. Asset and Unit combinations must exist in *Asset–Unit*; the same override applies. System availability is filtered by *System Scoping Rule* given the chosen Asset and Domain. Domain and Kind combinations are not constrained in this release but the data model permits adding such a table later.

Every reference value carries a Status of Active or Inactive. Inactive values are hidden from the wizard but remain visible in Search and historical records.

### 9.3 Concurrency

Number issuance is the one place in the system that absolutely must not race. The implementation is a Dataverse custom action (`enmax_acdnIssueNumbers`) that takes the six segment codes and the requested count, and returns the array of issued sequence numbers. The action runs inside a Dataverse plug-in step registered synchronously on a stub message; the plug-in opens an `IOrganizationService` transaction, retrieves the *Number Sequence* row with the matching `SequenceKey`, takes a pessimistic lock (Dataverse honours optimistic concurrency with `Version Number`; the plug-in retries on `ConcurrencyVersionMismatch` up to three times before failing), increments `LastIssued` by `count`, writes the row back, and returns the issued range. The Code App calls the action with retry-and-back-off semantics that surface a friendly *Try again in a moment* message on the third failure.

This is the only correct way to do this on Dataverse. Issuing numbers from the client, or from a non-transactional flow step, will eventually duplicate. The custom action is the load-bearing piece; treat it as such in tests.

A Phase 2 enhancement may move this logic to a long-term lock table that supports cross-environment portability without plug-in deployment; for Phase 1 the plug-in approach is canonical and well-supported.

### 9.4 Seeding and the legacy-migration handover

Every Number Sequence row carries a `Seed Value`. The next number issued is `max(Last Issued, Seed Value) + 1`. The seed is the mechanism by which the new system inherits the state of the legacy system at cut-over: for each (BB,AA,UU,DDD,SSS,KK) combination whose legacy SQL Server last issued, say, `0500`, the admin sets `Seed Value = 500` on the matching Dataverse row and the next number issued by the new system is `0501`. Combinations untouched by the legacy system retain `Seed Value = 0` and start at `0001`.

The seed is settable through three paths:

1. **Per-row edit in the admin UI.** The *Reference Data → Number Sequences* grid lets an admin click into any sequence and edit its `Seed Value`. After the first issuance, edits require a typed `Seed Reason` and trigger an audit event.
2. **CSV bulk import.** The admin uploads a CSV with columns `SequenceKey, SeedValue, Reason` and the import action upserts every row. Validation rejects any row whose `SeedValue` is less than the existing `LastIssued` on that sequence; the entire batch fails atomically if any row is invalid. This is the canonical path for legacy migration.
3. **YAML seed at deploy time.** The standard seed loader (section 22) reads `solution/seed/number_sequences.yaml` and applies the seed values during environment provisioning. Useful for dev tenant initialisation and for fresh UAT environments.

The constraint that `Seed Value < Last Issued` is impossible by definition (an admin cannot rewrite history) is enforced both in the plug-in and at the form layer. The constraint that `Last Issued <= 9999` is the hard ceiling; the plug-in refuses to issue past it and the system raises a Critical broadcast at the 9900 threshold to give admins time to react.

### 9.5 Format rigidity

The drawing sequence is always 4 digits, zero-padded, in the range `0001` through `9999`. The sheet sequence is always 3 digits, zero-padded, in the range `001` through `999`. Both are formatted by `string.format("{0:0000}", n)` and `string.format("{0:000}", n)` respectively at the composition layer; nothing in the system stores or displays an unpadded value. The `MaxSheetsPerDrawing` configuration key caps the practical sheet upper bound (default 50), but the column is sized for the full three-digit range so the format never changes between environments.

If a combination is forecast to exceed 9999 (which would be unusual given the granularity of the segment scheme), the operational response is to retire the sequence and introduce a new combination that differs by Domain, System or Kind. The system does not permit auto-extending the format to five digits; the legacy convention is preserved.

---

## 10. Automation architecture: Power Automate flows

Every automation runs under the service account `eec_pwrplat_svc@enmax.com`. Connection references are named per the guardrails in section 14. The Phase 1 design comprises **thirteen parent flows plus three child flows for email composition** (sixteen flows in total). The parent flows are listed by trigger and purpose:

| Flow display name | Trigger | Purpose |
|---|---|---|
| ENMAX AutoCAD: On Reservation Created → Notify Admins | Dataverse: Row created on Reservation | Compose admin email from shared mailbox, post Teams adaptive card to each Admin and Approver in their 1:1 chat, write In-App Notification rows for the same audience, log the outbound Notification row |
| ENMAX AutoCAD: On Reservation Approved → Issue Drawings and Sheets | Dataverse: Row updated on Reservation (status → Approved) | For each issued number, create the Drawing row and N Sheet rows (N = Sheets Per Drawing) with deterministic filenames pre-computed and `State = PendingInitialUpload`. No SharePoint writes. Email the requester from the shared mailbox; post Teams adaptive cards to each member of the Approvers and Admins teams in their personal chat; write In-App Notification rows for the requester |
| ENMAX AutoCAD: On Asset-Unit Activated → Provision SharePoint Library | Dataverse: Row created or activated on Asset-Unit | Create the `BB-AA-UU` document library in the site collection, bind the *Generation Drawing Information* content type, configure major versioning, apply the security-trimmed permissions, and write the library URL back into the Asset-Unit row. One-time setup per Asset-Unit |
| ENMAX AutoCAD: On Reservation Declined → Notify Requester | Dataverse: Row updated on Reservation (status → Declined) | Email requester with reason and deep link |
| ENMAX AutoCAD: On Revision Submitted → Index SharePoint and Notify Approvers | Dataverse: Row updated on Checkout (status → AwaitingValidation) | Query the Asset-Unit library by deterministic filename prefix; capture URLs onto the corresponding Sheet rows; flag any missing sheets on the Drawing; notify approvers and admins across all three channels (email from shared mailbox, Teams adaptive card to each member's 1:1 chat, In-App Notification rows) |
| ENMAX AutoCAD: On Checkin Approved → Finalise Drawing | Dataverse: Row updated on Checkout (status → ClosedApproved) | Bump the Drawing's `Current Revision`; finalise Sheet URLs as the canonical hot-links; notify the user. No SharePoint writes |
| ENMAX AutoCAD: On Checkin Declined → Revert to Checked Out | Dataverse: Row updated on Checkout (status → ClosedDeclined) | Clear the captured Sheet URLs; reopen the Checkout; notify user with reason |
| ENMAX AutoCAD: Stale Checkout Reminder (Scheduled) | Recurrence: daily 06:00 MT | Find Checkouts whose age has crossed 3, 6 or 12 months and not yet reminded at that stage; send reminders; update Reminder Stage |
| ENMAX AutoCAD: On Force Checkin → Admin Override | Dataverse: Row updated on Checkout (status → ClosedForced) | Close the Checkout; audit the override; notify the original user. No SharePoint writes |
| ENMAX AutoCAD: On Reference Data Changed → Audit | Dataverse: Row created/updated/deleted on any reference table | Write a single Audit Event |
| ENMAX AutoCAD: On App Config Changed → Audit and Broadcast | Dataverse: Row updated on App Configuration | Audit; optionally publish a tenant-wide event for cache invalidation in Phase 2 |
| ENMAX AutoCAD: On Broadcast Published → Fan Out In-App Notifications | Dataverse: Row created or updated on Broadcast (status → Active) AND scheduled recurrence (hourly) | Resolve the audience from the Broadcast.Audience field to the set of users in the chosen teams; for every user without an existing In-App Notification for this Broadcast, create one; idempotent so re-runs do not duplicate |
| ENMAX AutoCAD: On In-App Action Triggered → Mark Read | Custom action invoked by Code App | When the user opens the bell panel or clicks an item, mark the relevant In-App Notification rows as Read; mirror dismissals to Broadcast Dismissal where applicable |

Flows use child flows for the email composition layer (one for *approval needed*, one for *approval result*, one for *reminder*) so that template changes touch one place. All HTML email is built from a single mustache-style template module; every email carries an unsubscribe footer that explains who to contact (the admin queue) since this is internal compliance traffic, not marketing.

---

## 11. Notification and approval UX

Approval notifications travel by three channels: email, Microsoft Teams adaptive cards, and in-app notifications. The three channels are complementary, not substitutes; all three fire for every approval event.

### 11.1 Email channel

Every outbound email sent by the system originates from the shared mailbox identified by the `SharedMailboxAddress` configuration key (currently `gen-drawings@enmax.com`, confirmed in section 26.3). The service account holds *Send As* permission on this mailbox, and every Power Automate flow that sends mail uses the *Send an email from a shared mailbox* action with the shared mailbox address explicitly set. The shared mailbox owns the conversation thread; replies route back to it and are visible to every admin and approver.

Email approvals use the Outlook *actionable messages* schema where supported, so the recipient can approve or decline from the inbox without opening the app. When actioned this way, the flow updates the Dataverse row through the bound custom action. When actioned in-app, the Code App calls the same custom action. The two paths converge on the same audit-emitting state transition.

### 11.2 Teams channel

Microsoft Teams notifications are delivered as adaptive cards in a one-to-one chat with each recipient, not to a Teams channel. The flow enumerates the membership of `team-enmax-autocad-admins` (for approval-needed events) or `team-enmax-autocad-approvers` (for the same events, fanned out in parallel) and posts an adaptive card to each user using the *Post adaptive card and wait for a response* action via the *Power Automate* bot. This keeps every notification visible in each person's individual chat queue rather than buried in a shared channel, and lets the receiver action the card directly from the chat.

For user-facing notifications (approval granted, approval declined, stale check-out reminder), the same one-to-one chat pattern applies: the card lands in the requester's personal chat with the bot. There is no group or channel posting in the Phase 1 design.

### 11.3 In-app channel

The in-app channel is the third leg. Every notification event that emits an email and a Teams card also writes one row to the *In-App Notification* table for every targeted recipient. The Code App's notification bell in the header polls (with a short cache) for unread rows on app load and on a 30-second background refresh, badges the unread count, and renders the panel as a stacked list ordered newest first, grouped by *Today*, *Earlier this week* and *Older*. Each item shows a severity-coloured leading icon, the title, the body in two lines with a *More* expansion, the timestamp in relative form (*5 minutes ago*), and a deep link affordance. Clicking the link marks the item read and navigates to the relevant Code App screen.

Broadcast Messages also surface here when the user is in the broadcast's target audience. A broadcast with `RequiresAcknowledgement = true` cannot be dismissed until the user clicks *Acknowledge*; the *Dismiss* control is replaced by the acknowledgement affordance for those items.

### 11.4 Anatomy of every notification

Every notification carries:

a one-line summary; the full computed number or the drawing title; the requester's name; the reason for reservation or the new revision number; the approval and decline action buttons (where the channel supports them); a deep link to the relevant Code App screen of the form `https://apps.powerapps.com/play/<env>/<app>?path=approvals/<id>`; and the Reservation ID or Checkout ID for traceability.

User-facing notifications (approval granted, approval declined, reminder) carry the same anatomy minus the action buttons. The deep link takes the user to *My Items*. Templates live in Appendix I.

---

## 12. Security model

Authentication is Entra ID single sign-on through the Power Platform host. There is no anonymous access.

### 12.1 Business unit posture

A dedicated child Business Unit named **`Enmax AutoCAD`** is created under the tenant root BU. All application-specific teams are scoped to this BU. End users, approvers and admins are all rooted in this BU; their personal user records remain in the tenant root for global identity purposes but the team memberships and role assignments live in the child BU. This gives the application clean isolation from any other Power Platform workloads sharing the same environment.

### 12.2 The 1:1:1 authorisation chain

Authorisation flows on a strict, repeating 1:1:1 mapping:

```
Entra ID Security Group  ─1:1─▶  Dataverse Team  ─1:1─▶  Dataverse Security Role
```

Three of these chains exist, one per persona:

| Entra Security Group | Dataverse Team | Dataverse Security Role | Population |
|---|---|---|---|
| `sg-enmax-autocad-users` | `team-enmax-autocad-users` | `role-enmax-autocad-user` | Regular community (~600 read, ~70 active) |
| `sg-enmax-autocad-approvers` | `team-enmax-autocad-approvers` | `role-enmax-autocad-approver` | Designated approvers (small, configurable) |
| `sg-enmax-autocad-admins` | `team-enmax-autocad-admins` | `role-enmax-autocad-admin` | Heather Quinn, PBK |

No user is ever assigned a Dataverse role directly. Membership flows from the Entra group: Microsoft 365 group membership populates the Dataverse team, which inherits the security role. Onboarding and offboarding therefore happen exclusively in Entra ID, which IT already governs.

### 12.3 The Basic User baseline

Every user across the three groups is additionally granted Dataverse's out-of-the-box **Basic User** security role on the environment. This is non-negotiable for Power Apps Code Apps: the Basic User role is what unlocks the platform-level permissions a user needs simply to open the app. The three custom roles above stack on top of it to grant the application-specific privileges.

### 12.4 Per-role privilege matrix

| Capability | User | Approver | Admin |
|---|---|---|---|
| Read reference tables | Yes | Yes | Yes |
| Read App Configuration | Yes | Yes | Yes |
| Create Reservation | Yes | No | Yes |
| Read Reservation | Own rows + shared with them | All rows | All rows |
| Update Reservation | Own rows (pre-approval only) | No | All rows |
| Cancel own pending Reservation | Yes | No | Yes |
| Approve / Decline Reservation | No | Via custom action `enmax_acdnApproveReservation` | Via custom action |
| Force overrides on Reservation | No | No | Via custom action |
| Read Drawing | Own + shared | All | All |
| Update Drawing metadata | No | No | Yes |
| Check out Drawing | Yes (via custom action) | No | Yes |
| Submit revised Drawing | Owner of check-out | No | Yes |
| Approve / Decline Check-in | No | Via custom action | Via custom action |
| Force Check-in | No | No | Via custom action |
| Read Audit Event | Own subject rows | All | All |
| Manage reference data (Business, Asset, Unit, Domain, System, Kind, Record Type, Record Phase, Vendor, Asset-Unit, BB-AA, System Scope) | No | No | Yes, self-serve, fully audited |
| Manage App Configuration | No | No | Yes |
| Force-checkin overrides | No | No | Yes |
| Share a record with another user | Yes (own records) | No | Yes (any record) |

Approvers are read-only at the row level. They cannot edit a Reservation or a Drawing directly. The only writes they can perform are through the bound custom actions `enmax_acdnApproveReservation` and `enmax_acdnApproveCheckin`, which encapsulate the state transition, write the audit event, and trigger downstream flows. This keeps the approval surface narrow and auditable.

### 12.5 Ownership and record-level sharing

Every Reservation row is owned by the user who created it. The Drawing rows produced from an approved Reservation inherit the requester as their owner. The Sheet rows under each Drawing inherit the same owner. A Checkout row is owned by the user who initiated the check-out, regardless of who owns the parent Drawing.

End users may share any record they own with another user or with a team, using the standard Dataverse share mechanism. Shared records appear in the recipient's *My Items* view alongside their own. Sharing grants Read by default; Append, Update and Delete shares are not exposed in the UI (Phase 1 keeps the sharing model simple). Admins may share or unshare on behalf of any user.

The combination of owner-based row scoping for end users and organisation-wide read for approvers and admins removes the need for per-Business Generation segmentation in Phase 1. If sub-team segmentation becomes necessary in Phase 2, additional child BUs can be added without breaking the existing chain.

### 12.6 The service account

The service account `eec_pwrplat_svc@enmax.com` runs every connection reference. Operationally it is a fourth principal that does not match any of the three personas: it is a member of all three Entra security groups solely for permission inheritance, but is excluded from every notification recipient list through an explicit filter on the *Acted On Behalf Of* and *Created By* columns. It holds an Azure AD Application registration with the SharePoint `Sites.Selected` permission scoped **Read-only** on the Generation Drawings site collection. Read is sufficient because the app never checks files out, in or modifies them; it only locates files by deterministic filename and records their URLs onto the Sheet rows. Library provisioning (one-time per Asset-Unit) is the single exception that requires a transient Site Owner permission during dev-tenant build; that permission is removed once provisioning completes. The service account also owns the Custom Connector for any non-Power-Platform integrations. Its credential is stored exclusively in Azure Key Vault, rotated quarterly, and retrieved at deploy time by the GitHub Actions Azure login action.

---

## 13. Application configuration table

The App Configuration table is the workaround for the platform constraint that Power Apps Code Apps cannot read Dataverse environment variables. Every value that would otherwise live in an environment variable lives here instead, keyed by string, with a typed `Value Type` column so the client can parse responsibly.

The Phase 1 keys are:

| Key | Value Type | Example | Purpose |
|---|---|---|---|
| `SingleAdminMode` | Boolean | `false` | When `true`, restricts app access to the Admin team and exposes the *View as end user* toggle in Settings for admins |
| `MaxDrawingsPerReservation` | Integer | `10` | The cap on distinct drawing numbers per reservation submission |
| `MaxSheetsPerDrawing` | Integer | `50` | The cap on sheets per drawing |
| `DefaultSheetsPerDrawing` | Integer | `1` | The wizard's default value for the sheets field |
| `StaleCheckoutMonths` | String | `3,6,12` | Comma-separated stages for reminder cadence |
| `ApproverTeamName` | String | `team-enmax-autocad-approvers` | Used to compose Teams adaptive card recipients |
| `AdminTeamName` | String | `team-enmax-autocad-admins` | Used to compose Teams adaptive card recipients and deep links |
| `SharedMailboxAddress` | String | `gen-drawings@enmax.com` | The shared mailbox from which all outbound email is sent |
| `SharePointSiteUrl` | String | `https://enmax.sharepoint.com/sites/GenerationDrawings` | Root of the SharePoint site collection |
| `BusinessUnitName` | String | `Enmax AutoCAD` | The dedicated child BU all teams sit under |
| `BrandPrimary` | String | `#E1393E` | Cinnabar; used as the Fluent theme accent |
| `BrandSecondary` | String | `#0F487A` | Chathams Blue |
| `BrandAccent` | String | `#F7DB9C` | Marzipan |
| `DefaultTheme` | String | `system` | `light`, `dark`, or `system` |
| `EnableTelemetry` | Boolean | `true` | Soft kill switch for client telemetry |
| `MaintenanceBannerTitle` | String | `Application under maintenance` | Title shown in the maintenance banner when `SingleAdminMode = true` |
| `MaintenanceBannerBody` | String | `The Generation Drawing Numbering app is undergoing maintenance and is temporarily read-only for end users. Administrators are operational. We expect normal service to resume shortly.` | Body copy for the maintenance banner |
| `MaintenanceBannerSeverity` | String | `Warning` | One of `Info`, `Warning`, `Critical`. Drives the banner accent colour |
| `FooterDisclaimer` | String | `This application is an internal ENMAX Energy Corporation tool. The data contained herein is confidential and subject to ENMAX information governance policy.` | Disclaimer shown in the footer of every screen |
| `FooterCopyright` | String | `© 2026 ENMAX Energy Corporation. All rights reserved.` | Copyright notice shown in the footer of every screen |
| `BroadcastFanOutCadenceMinutes` | Integer | `60` | The cadence in minutes at which the hourly fan-out flow runs |

`MaxDrawingsPerReservation` and `MaxSheetsPerDrawing` are editable by admins through the *Reference Data → Settings* tab in the Code App. Other keys are editable only through the model-driven administration app.

Every value is seeded with a deterministic GUID and copied bit-for-bit across environments by the deployment scripts.

---

## 14. Naming conventions and platform guardrails

The conventions below apply to every artefact in the solution. They are not advisory.

```
Publisher
  Display Name : Enmax Energy Corporation
  Schema Name  : EnmaxEnergyCorporation
  Prefix       : enmax
  Option Set
  Value Prefix : 100000000  (the standard Dataverse range)

Choice Values (every Global Option Set)
  Value 0      : RESERVED. Named "None". The default sentinel for any
                 unset Choice column. Every option set carries this row
                 explicitly so downstream code can rely on its presence.
  Values 1..N  : The real options, numbered sequentially from 1.
  Convention   : Code that compares to a Choice value must compare to 0
                 to mean "unset", never to NULL.

Solution
  Display Name : Enmax AutoCAD Document Numbering System
  Schema Name  : enmax_autocadsln

Tables
  Display Name : Sentence case business name (e.g. Reservation, Drawing)
  Schema Name  : enmax_autocad<tablename> (lowercase always)
                 e.g. enmax_autocadreservation

Columns
  Display Name : As per business need
  Schema Name  : enmax_acdn<columnname>
                 e.g. enmax_acdnreservationid

Global Choices (no local picklists)
  Display Name : <ChoiceName>
  Schema Name  : enmax_acdn_<ChoiceName>
                 e.g. enmax_acdn_ReservationStatus

Flows
  Display Name : ENMAX AutoCAD: <Trigger and Use Case>
                 e.g. ENMAX AutoCAD: On Reservation Created → Notify Admins

Environment Variables (Power Automate only)
  Display Name : Envar:<VariableName>
  Schema Name  : enmax_envar<VariableName in PascalCase>
                 e.g. enmax_envarAdminMailboxAddress

Connection References
  Display Name : Connection Ref:<ConnectionName>
  Schema Name  : enmax_connref<ConnectionName in PascalCase>
                 e.g. enmax_connrefDataverse

Custom Actions
  Display Name : <PascalCaseUseCase>
  Schema Name  : enmax_acdn<PascalCaseUseCase>
                 e.g. enmax_acdnIssueNumbers
```

Note on connection references: the user-supplied convention spells the prefix `enmax_envar` for both environment variables and connection references. We use `enmax_connref` for connection references to keep the two distinguishable in the solution explorer. If the convention as stated must be preserved verbatim, the spec defers to whatever the user confirms first; the verification task in section 23 flags this for sign-off.

Every Choice column is a global option set. No local picklists are created. Where a choice exists today as a local field in a screenshot, the migration recreates it as a global choice and re-points the column.

---

## 15. Solution architecture and technology stack

The solution is delivered as a single Dataverse solution package (`enmax_autocadsln`) containing every table, column, choice, role, custom action, flow, connection reference, environment variable, and the two app resources. The Code App is registered with the platform via the *Power Apps Code Apps* feature; the React shell is packaged and published with the npm-based `power-apps` CLI. The model-driven administration app is a standard model-driven app.

### 15.1 Code Apps platform composition

A Power Apps Code App is composed of four cooperating pieces, per the Microsoft Learn architecture reference. Understanding the separation of concerns matters because it constrains how we structure the codebase and how we test.

| Layer | What it is | Who owns it |
|---|---|---|
| Your code | The React + TypeScript SPA we author and maintain in this repo | Us |
| `@microsoft/power-apps` SDK (the *Power Apps client library for code apps*) | The npm package that exposes the runtime APIs the app calls, manages generated models and services for connectors, and brokers requests to the Power Platform | Microsoft |
| `power.config.json` | A generated metadata file the SDK and CLI use to manage connections and to drive publishing. Application code does not read or write this file | SDK and CLI |
| Power Apps host | The runtime that loads the app, performs Microsoft Entra authentication, presents contextual error messages on load failures, and applies tenant-level managed-platform policies (DLP, sharing limits, Conditional Access, App Quarantine) | Microsoft |

At runtime, the three live components are *Your code*, the SDK, and the host. The host owns the front door (auth, load, error display); the SDK owns the data plane (connector calls, generated services); the app owns the experience.

### 15.2 Tooling and stack (current and canonical)

The npm-based `power-apps` CLI bundled with `@microsoft/power-apps` v1.0.4+ is the canonical tool for Code Apps. The legacy `pac code` family of commands is deprecating; we use the npm CLI from day one and reserve PAC CLI for solution packaging, plug-in registration and connection-reference work where it remains the right tool.

```
Frontend (Code App)
  Scaffold seed   : npx degit github:microsoft/PowerAppsCodeApps/templates/vite apps/code-app
  Framework       : React 18, TypeScript 5
  UI library      : Fluent UI v9 (themed against the ENMAX brand)
  Build           : Vite
  Bundler         : Vite (Rollup under the hood)
  State           : React Query for server state, Zustand for client state
  Routing         : React Router v6
  Forms           : React Hook Form + Zod
  Power Apps SDK  : @microsoft/power-apps (latest stable >= 1.0.4)
  Testing         : Vitest (unit + component), Playwright (end-to-end), MSW (network mocks for component tests)
  Accessibility   : @axe-core/playwright on every page
  i18n            : Not in scope (English only)

Admin App
  Model-driven    : Out-of-the-box model-driven app over the same Dataverse tables

Backend / Platform
  Dataverse       : Tables, global choices, custom actions (C# plug-in), roles, audit
  Power Automate  : Cloud flows (Dataverse triggers, scheduled, custom-action), child flows for email composition
  SharePoint      : Single site collection, one library per Asset-Unit, Generation Drawing Information content type
  Identity        : Entra ID SSO (handled by the Power Apps host), three security groups, service account

Tooling
  power-apps CLI  : init, run, push (replacing pac code) – primary Code App tool
  PAC CLI         : Solution pack/unpack, import/export, connection reference and environment variable management, plug-in registration
  Dataverse MCP   : Project-scoped remote endpoint for Claude Code agentic dev
  REST fallback   : When PAC and MCP are insufficient (Dataverse Web API direct)
  Python pkg      : Build and seed-import scripts for solution packaging and deterministic-GUID seeding
  Power Platform Skills : Project-scoped install only

Repo / DevOps
  Source          : Private GitHub repo (tqnonline/enmax-autocad)
  Branching       : Trunk-based; short-lived feature branches → dev → main
  Orphan branches : specs, runbooks (worktrees from main, never merged in)
  CI              : GitHub Actions, fast builds, axe-a11y gate
  CD              : Automated to dev tenant on dev-branch push; manual approval gate from dev to UAT (ENMAX tenant)
```

The Code App's day-to-day local-dev loop:

```
# One-time scaffold (issue #017)
npx degit github:microsoft/PowerAppsCodeApps/templates/vite apps/code-app
cd apps/code-app
npm install
npm install @microsoft/power-apps
npx power-apps init --displayName "Enmax AutoCAD Document Numbering" --environmentId <DEV_ENV_ID>

# Daily inner loop
npx power-apps run     # local dev server with hot-reload against the platform

# Publish a build to the dev tenant (CI runs this)
npm run build          # tsc -b && vite build
npx power-apps push    # publishes the new version; the platform issues a play URL
```

### 15.3 Hard platform limitations we must respect

The following are not negotiable until Microsoft ships support. They constrain scope and shape the architecture choices already made elsewhere in this spec.

| Limitation | Source | Impact on this build |
|---|---|---|
| Code Apps cannot read Dataverse environment variables | Documented platform constraint | Every Code App configuration value lives in the *App Configuration* Dataverse table (section 13). Power Automate flows continue to use environment variables freely |
| Not supported in the Power Apps mobile app or Power Apps for Windows | MS Learn: *Limitations* | The app is browser-only. F-30 (no mobile) is aligned with the platform reality, not just a scope choice |
| No Power BI data integration (`PowerBIIntegration` function) | MS Learn: *Limitations* | Phase 2 reporting goes to a separate Power BI workspace; embedding the app inside a Power BI report is possible via the *Power Apps Visual* path, but is not in Phase 1 scope |
| No SharePoint forms integration | MS Learn: *Limitations* | We do not author SharePoint forms from this app; the *Generation Drawing Information* content type's columns are managed in SharePoint independently |
| No Storage SAS IP restriction support | MS Learn: *Limitations* | Document with IT Security; not material for this build because we do not use SAS-protected storage in Phase 1 |
| No Power Platform Git integration | MS Learn: *Limitations* | Solution lifecycle relies on PAC CLI pack/unpack and the GitHub Actions pipeline in section 19, not the platform's native Git integration |

Two operational considerations that are not strict limitations but matter:

December 2025 Chrome and Microsoft Edge began blocking requests from public origins to local endpoints by default. For local-dev with `npx power-apps run`, developers grant the browser permission once per profile. For any future embedded scenario (Power Apps Visual in Power BI, iframe-in-Teams-tab), the host page must include `allow="local-network-access"` on the iframe element.

The Power Apps host owns authentication. We do not implement any sign-in flow. Microsoft Entra single sign-on happens at the host layer; our code receives an authenticated context. No tokens are stored or refreshed by application code.

### 15.4 Environment and licensing prerequisites

Three prerequisites must be in place before users can run the app in any environment:

```
1. Environment-level Enable code apps toggle is ON.
   Power Platform admin centre → Manage → Environments → [env] →
   Settings → Product → Features → "Enable code apps" → Save.

2. Every end user holds a Power Apps Premium licence.
   Standard M365 licences are not sufficient.

3. The published app is shared with the three Dataverse teams
   (Users, Approvers, Admins) per the security model in section 12.
```

A separate runbook (`runbooks/003-power-platform-environment-setup.md`) covers items 1 and 3 for the dev tenant; item 2 is a procurement question to flag with ENMAX procurement before UAT.

### 15.5 Managed-platform capabilities we inherit for free

Because the host owns the runtime, the app picks up the following without any work on our part: end-user consent dialogue for connector permissions, canvas-app-style sharing limits, App Quarantine, DLP policy enforcement at app launch, Conditional Access on the individual app, admin consent-dialogue suppression (for Microsoft and custom Entra-OAuth connectors), tenant isolation, Azure B2B for external user access, and operational health metrics in both the Power Platform admin centre and the maker portal. The spec assumes these are configured by the tenant administrators rather than by the application.

The Power Platform Skills plugin is installed at the project level only, never globally. The Claude Code superpowers plugin lives in the developer's workstation configuration.

---

## 16. UX system: Fluent UI v9 against the ENMAX brand

The visual layer respects the design system in `design.md`. The Fluent UI v9 theme is built by composing a custom brand variant whose accent ramps are seeded from Cinnabar (`#E1393E`), with Chathams Blue (`#0F487A`) as the secondary action colour and Marzipan (`#F7DB9C`) as the warm accent. The neutral ramp uses the design system's neutrals. Both light and dark themes are first-class, with dark adjusting Cinnabar to `#FF6B73`, Chathams Blue to `#5BA3E8`, and Marzipan to `#E8C76A` per the brand guide.

Typography uses the platform font stack with Inter as the preferred face. The grid is 8-point. Spacing tokens follow the Fluent semantic tokens (`spacingHorizontalS`, etc.). Border radii use the Fluent defaults; only the brand button is permitted a slightly tighter radius to match the legacy red CTA on the ENMAX site, if doing so does not break Fluent's keyboard focus ring.

Iconography is Fluent UI Icons v2 in monoline. The ENMAX logo appears in the application shell header in three states: `ENX_Logo_RED.svg` for the light theme header, `ENX_Logo_WHITE.svg` for the dark theme header, and `ENX_Logo_BLACK.svg` for high-contrast or print contexts. SVGs are bundled at build time from `/Enmax branding/_svg`.

Accessibility is non-negotiable. WCAG 2.1 AA across the entire app, AAA on text and meaningful imagery where the design system already meets AAA. Every interactive element is keyboard-reachable. The focus order matches the visual order. Live regions announce status changes for screen readers. The colour-only rule is observed: every red, green or amber state carries a corresponding icon and a text label.

Motion is purposeful and brief. The reservation wizard uses a slide transition between steps. The approval grid uses a fade-in on row insertion. Reduced-motion preferences are honoured.

---

## 17. Two-app split: Code App and Administration model-driven app

### 17.1 Enmax AutoCAD Document Numbering (Code App)

The end-user and administrator-facing application. Built with React and Fluent UI v9, packaged as a Power Apps Code App, branded per section 16. It implements every screen in section 6 and every journey in section 5. It is the front door for end users and the primary working surface for the admin team. The *Reference Data* and *Audit* destinations in this app provide a polished, opinionated view of the underlying tables; the raw Dataverse forms remain in the second app for emergencies.

### 17.2 Enmax AutoCAD Administration (model-driven)

A thin model-driven app over every Dataverse table in the solution. Its purpose is housekeeping: bulk reference-data edits, post-mortem inspection, manual data correction, audit log triage, and configuration tweaks that the Code App's polished UI does not expose. It uses the out-of-the-box experience. No custom forms or views beyond what the model-driven app generates by default. Access is restricted to the IT Admin team.

---

## 18. Development workflow: Claude Code, GitHub, subagents, tests

The development model is agent-driven and issue-shaped. Every increment of work is a GitHub Issue. Issues are scoped tightly enough that a single Claude Code session, augmented by subagents for verification, can take an issue from green-field to a merged PR on the `dev` branch.

The flow per issue is:

```
1. Issue is opened with acceptance criteria, file targets, and links to the spec section.
2. Claude Code is invoked in a worktree.
3. It reads the relevant spec section(s) and any referenced runbook entries.
4. It implements the change. It writes tests alongside.
5. It runs unit and end-to-end tests. It iterates until green.
6. It uses a verification subagent to cross-check the implementation against the spec.
7. It opens a PR against `dev` with a squash-merge message that references the issue.
8. CI runs on the PR. Reviewer approves. Squash merge.
```

Subagents are used liberally: a *planner* subagent for design plans on non-trivial issues, an *implementer* for the actual code, a *verifier* for the cross-check, and a *test-runner* for the end-to-end suite. The orchestrator (the parent Claude Code session) coordinates them and makes the user-visible decisions.

The progression of development follows the layering:

```
1. Repo scaffolding, CLAUDE.md, contribution guide, proprietary licence, CI baseline
2. Solution skeleton, connection references, environment variables
3. Reference tables and seed data
4. Core transactional tables (Reservation, Drawing, Checkout, Audit, AppConfig)
5. Plug-in for IssueNumbers custom action
6. Code App shell, theme, navigation, identity
7. Reservation wizard
8. Search
9. My Items
10. Approvals (admin)
11. Reference Data and Audit (admin)
12. Settings, Single Admin Mode
13. Power Automate flows (in the order they are needed by the screens)
14. Notification templates (email and adaptive cards)
15. Model-driven admin app
16. End-to-end test suite passes against a fresh import into a clean tenant
```

Each numbered step is a milestone made up of several issues. Issue templates live in `.github/ISSUE_TEMPLATE/`.

---

## 19. CI/CD with GitHub Actions

Two workflows cover the lifecycle. `ci.yml` runs on every PR against `dev` or `main`: it installs dependencies, runs the linter (ESLint with the project config), runs Vitest with coverage, runs `npm run build` (which executes `tsc -b && vite build`) to produce the Code App bundle, runs Playwright tests with `@axe-core/playwright` against a local mock, and uploads the build artefact. `cd-dev.yml` runs on push to `dev`: it packs the Dataverse solution with PAC CLI, runs the Python script (`solution/scripts/seed.py`) for deterministic-GUID seed data, imports the solution into the developer tenant, publishes the Code App with `npx power-apps push` against the dev environment, and runs a smoke-test subset of Playwright against the published app URL.

A separate `cd-uat.yml` exists but requires a manual approval gate via the GitHub Environments review feature. It targets the ENMAX tenant. The same solution package and the same seed YAML; the deployment differs only in the environment ID passed to `power-apps push`, the connection reference defaults, and the App Configuration values appropriate to UAT.

The pipeline respects the platform's tooling reality: `npx power-apps push` is the only supported way to publish a Code App. PAC CLI handles solution packaging, plug-in registration, connection reference and environment variable management; the npm CLI handles the Code App. The two are complementary and neither is optional.

Build performance matters for the 24-hour build window and for day-to-day iteration. The Vite build is configured with persistent caching. Playwright shards by browser. PAC CLI is invoked with the `--inactivityTimeout` set generously to avoid spurious retry storms. The Power Apps SDK and the generated connector models are cached between runs; cache invalidation is keyed off the `package-lock.json` and the connector reference list in `power.config.json`.

Secrets are stored in GitHub Environments scoped per tenant. The service account credential is held in Azure Key Vault and referenced by the deploy workflow via the official Azure login action. Both the npm CLI and the PAC CLI authenticate using the same service principal, scoped per environment.

---

## 20. Repository layout, branching and CLAUDE.md

### 20.1 Layout

```
/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── ci.yml
│       ├── cd-dev.yml
│       └── cd-uat.yml
├── apps/
│   ├── code-app/                  # React + Fluent UI v9 Code App
│   │   ├── src/
│   │   ├── tests/
│   │   ├── e2e/
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── admin-app/                 # Model-driven app metadata (PAC-managed)
├── solution/
│   ├── src/                       # Unpacked solution source (PAC unpack)
│   ├── plugins/
│   │   └── IssueNumbers/          # C# Dataverse plug-in for concurrency
│   └── scripts/
│       ├── pack.py
│       ├── import.py
│       ├── seed.py                # Deterministic-GUID seed loader
│       └── export.py
├── docs/
│   └── (lightweight references only; specs live on orphan branch)
├── CLAUDE.md
├── CONTRIBUTING.md
├── LICENSE                        # Proprietary
├── README.md
└── package.json                   # Workspace root
```

### 20.2 Branching

`main` is protected. `dev` is the integration branch. Feature branches are short-lived and named `feat/<issue-number>-<slug>` or `fix/<issue-number>-<slug>`. PRs target `dev`. Squash merge only. `dev` to `main` is a release-cut PR with a tagged version. Two orphan branches sit beside the main tree and never merge in: `specs` and `runbooks`.

### 20.3 CLAUDE.md

The repo's `CLAUDE.md` is a copy of the rules in `referenceClaude.md`, adapted to point at the spec sections in this document. It opens with the same project-specific worktree pattern (specs at `.worktrees/specs/docs/superpowers/specs/<specname>.md`, plans at `.worktrees/specs/docs/superpowers/plans/<plan-name>.md`, recreated with `git worktree add .worktrees/specs specs`), and continues with the same thirteen rules verbatim. Two additions specific to this project:

```
## Rule 14: Concurrency-safe issuance is non-negotiable
Number issuance must go through the Dataverse custom action backed by the
plug-in. Never issue numbers from the client. Never issue numbers from a
non-transactional flow. Tests must include a concurrent-request test that
fires N parallel calls and asserts N distinct numbers.

## Rule 15: Code Apps cannot read environment variables
Read every configuration value through the App Configuration table. Never
attempt to read a Dataverse environment variable from the Code App. Power
Automate flows may continue to use environment variables; the App Configuration
table is the Code App side of the same idea.
```

A `CONTRIBUTING.md` covers branching, PR style, commit conventions (Conventional Commits), and the agent-driven workflow.

The `LICENSE` is a proprietary one-paragraph copyright notice in ENMAX's name, all-rights-reserved.

---

## 21. Runbooks branch and manual handoffs

Anything that requires a human in a portal lives in `runbooks/` on the orphan `runbooks` branch. The runbooks are referenced from the GitHub issues created for those manual tasks. They are never merged into `main` and never pollute the main repo tree. They are checked out alongside the main tree using a worktree pattern (`git worktree add .worktrees/runbooks runbooks`).

The initial set of runbooks needed for Phase 1:

| Runbook | Owner | Trigger |
|---|---|---|
| `runbooks/001-service-account-provisioning.md` | IT Admin | Before any deployment |
| `runbooks/002-entra-security-groups.md` | IT Admin | Before role assignment |
| `runbooks/003-power-platform-environment-setup.md` | IT Admin | First-time dev tenant build (includes the *Enable code apps* feature toggle and the Power Apps Premium licensing confirmation) |
| `runbooks/004-sharepoint-site-and-library-creation.md` | IT Admin / Site Owner | Before SharePoint integration tests |
| `runbooks/005-content-type-and-term-set-binding.md` | IT Admin | After SP site creation |
| `runbooks/006-connection-references-on-service-account.md` | IT Admin | Before solution import |
| `runbooks/007-plugin-registration.md` | IT Admin / Dev | After solution import |
| `runbooks/008-teams-channel-and-bot-permissioning.md` | IT Admin | Before approvals testing |
| `runbooks/009-key-vault-secrets-and-github-environments.md` | IT Admin | Before CI deploys |
| `runbooks/010-uat-deployment-checklist.md` | IT Admin / Architect | UAT promotion |

Each runbook follows the same shape: prerequisites, step-by-step instructions with exact navigation breadcrumbs and screenshots, verification, rollback, and an *escalation contact*. Each is paired with a GitHub Issue tagged `area:manual-handoff` and linked from the relevant code-side issue.

---

## 22. Seed data and deterministic GUID strategy

Every master and reference row in the solution carries a deterministic GUID. The same row in dev, UAT and production shares the same `id`. This makes solution import idempotent and trivialises cross-environment debugging.

The deterministic GUID is computed as `uuid5(namespace, payload)` where the namespace is a project constant (`UUID-NAMESPACE = uuid5(URL_NAMESPACE, "enmax-autocad")`) and the payload is the table name plus the row's natural key.

```
def deterministic_id(table: str, natural_key: str) -> uuid.UUID:
    return uuid.uuid5(UUID_NAMESPACE, f"{table}|{natural_key}")
```

Natural keys per table:

```
enmax_autocadbusiness        → Code                       (e.g. "GW")
enmax_autocadasset           → Business.Code + Asset.Code (e.g. "GW|GN")
enmax_autocadbusinessasset   → Business.Code + Asset.Code
enmax_autocadunit            → Asset.Code + Unit.Code
enmax_autocaddomain          → Code
enmax_autocadsystem          → Code
enmax_autocadkind            → Code
enmax_autocadrecordtype      → Code
enmax_autocadrecordphase     → Code
enmax_autocadvendor          → Vendor name (normalised)
enmax_autocadassetunit       → Asset.Code + Unit.Code
enmax_autocadsystemscope     → System.Code + Scope.Type + Scope.Value
enmax_autocadappconfig       → Key
```

For every Global Option Set, the seed loader writes value `0` named `None` first, then writes the real values starting at `1`. The loader fails fast if any option set is missing the `0 = None` row, since downstream code relies on it.

For every Asset-Unit row that is `Active`, the SharePoint library provisioning flow runs idempotently on first deployment and on every subsequent activation. The Asset-Unit row's `SharePoint Library URL` column captures the resulting URL, making cross-environment portability trivial: the same logical Asset-Unit always points to a library named with the same code, even if the tenant prefix differs.

Seed data is held in YAML files under `solution/seed/`. The `solution/scripts/seed.py` Python script reads the YAML, computes the deterministic GUIDs, and either inserts or upserts each row through the Dataverse Web API using the service account.

Initial seed payload covers every value in Appendices A through H: that is, the full Business, Asset, Approved BB–AA, Unit, Asset–Unit, Domain, System, Kind, Record Type, Record Phase and Vendor sets from the source workbook. App Configuration is seeded with the keys listed in section 13, with defaults appropriate for the developer tenant.

### 22.1 Canonical master-data source

The canonical source for every reference-table seed is the *Master data.xlsx* workbook supplied by ENMAX (held alongside this spec). The seed loader does not consume the workbook directly. A one-off transform script (`solution/scripts/extract_master_data.py`) reads the workbook and emits the per-table YAML files into `solution/seed/`, applying the following transformations in this order:

1. **Code and display-name parsing.** Every value of the form `CODE - Description` is split on the first ` - ` substring. The left side becomes the row's `Code` column; the right side becomes the `DisplayName`. The `Description` column receives the original full string for traceability.
2. **Character substitution from `ColumnValueMapping`.** The `System` and `ShepardMaximoAssetIDSystem` columns receive the SharePoint-safe substitutions captured in the `ColumnValueMapping` sheet: `<` becomes `under` and `>` becomes `over`. The six explicitly-mapped codes (EHA, ELA, ELB, ELC, EMB, EMC) carry their *NewSPOTermValue* as the canonical display name.
3. **Encoding cleanup.** The `¿` character that appears in long-form Shepard system names is restored to `–` (en dash) before display.
4. **De-duplication.** Trivial duplicates (e.g. `GG,GG`, `CG,CG`, `02,02`) introduced by data-entry artefacts are collapsed on the `Code` column.
5. **`XXX` and `XX` sentinel preservation.** These literals are kept as real Active rows in their respective tables, with `Code = XXX` (or `XX`) and `DisplayName = Unspecified`, so legacy records that carry the sentinel can be migrated without remediation.

### 22.2 What does and does not seed in Phase 1

The workbook contains nine logical sub-tables in `ColumnValues`. Eight seed directly into the corresponding Dataverse table for Phase 1: Business, Asset, Unit, Domain, Kind, Record Type, Record Phase, and Vendor. The System list is the ninth and largest, seeding both into the Dataverse `System` reference table and (as a Phase 2 follow-up) into the SharePoint *Systems* term store. Asset-Unit and Approved BB-AA junction tables are derived from the *Numbering Coding Identifiers* document (Attachments 1 and 2) and seeded alongside.

The remaining workbook columns (`DrawingInfoBusiness/Asset/Unit/Domain`, `Project`, `Owner Group`, `Creation Source`, `Lifecycle`, `Status`, `GWECECSystem`, `GWEShepardMaximoHierarchyUnit`, `ShepardMaximoAssetIDUnit`, `ShepardMaximoAssetIDSystem`) belong to sibling content types in the source SharePoint environment that are out of scope for this build. They are extracted to YAML by the script and stored under `solution/seed/_unused/` for future reference, but they are not loaded into the dev tenant.

### 22.3 The `Generation Drawing Information` content type is canonical

Of the ten content types in the workbook's `Content Types` sheet, only **`Generation Drawing Information`** is bound to the per-Asset-Unit document libraries in scope for Phase 1. The remaining nine (`ENMAX Document`, `ENMAX Email`, `GWE-CEC`, `Originator Drawing Information`, `Drawing Info Category`, `GWE_Shepard_Maximo_Hierarchy`, `Shepard-Maximo-Asset-ID`, and the two composite types) exist in the source environment but are not provisioned by this solution. The library provisioning flow binds only `Generation Drawing Information`.

The workbook's note that *"All columns will set to not required until the migration is completed"* is honoured at the SharePoint column-level layer (every CT column has `Required = No`). The Dataverse table columns enforce required-ness for the application path regardless, since validation is the application's responsibility, not SharePoint's.

---

## 23. Test strategy

Tests sit at four layers, each carrying its own responsibility:

```
Unit            (Vitest)        : Pure-logic functions, validators, theme tokens, hooks with mocks
Component       (Vitest + RTL)  : React components in isolation with realistic props
Integration     (Vitest + MSW)  : Components against mocked Dataverse responses
End-to-end      (Playwright)    : The full Code App against a real developer-tenant environment
```

The concurrency test for `IssueNumbers` deserves a special mention. It must fire N parallel calls to the custom action (N ≥ 50) against a real Dataverse instance and assert that the returned values are unique, contiguous and monotonically increasing. This test is the canary for any future refactor of the plug-in.

Accessibility tests use `@axe-core/playwright` on every page. Visual regression tests use Playwright's built-in screenshot diff on key flows. The CI pipeline fails the PR on any new axe violation or new pixel diff above a 0.1% tolerance.

The verification subagent at the end of the dev loop reads the spec section the issue references and reports any drift between what the spec says and what the code does. It does not write code; it writes a short report that the orchestrator either acts on or files as a follow-up issue.

---

## 24. Acceptance criteria for Phase 1

The Phase 1 build is signed off when all of the following are true in the developer tenant, demonstrated end-to-end with the Heather Quinn persona and a synthetic end-user persona:

```
A1  An end user can reserve between one and `MaxDrawingsPerReservation`
    drawings (each with one to `MaxSheetsPerDrawing` sheets) and receive
    an approval notification by email from the shared mailbox and a Teams
    adaptive card in their personal chat.
A2  Two simultaneous reservation requests for the same combination receive
    distinct, contiguous drawing numbers and zero client-side retries.
A2a On reservation approval, N Drawing rows and N x M Sheet rows are created
    in Dataverse with deterministic filenames pre-computed and owned by
    the requester. No files are written to SharePoint; users upload to
    the appropriate Asset-Unit library themselves through the standard
    SharePoint UI.
A2b When the user submits a revision, the app locates the matching files
    in the Asset-Unit library by deterministic prefix and writes the URLs
    onto the Sheet rows; missing sheets are surfaced to the approver. No
    SharePoint check-out, check-in or version operation is invoked by the
    application.
A3  An admin can approve a reservation from the inbox, the Teams card or
    the in-app grid, with the same Dataverse outcome from each path.
A4  An admin can decline a reservation with a reason. The reason is delivered
    to the requester verbatim.
A5  Soft validation override is invoked with a typed reason on an invalid
    Business-Asset combination and the row carries the override flag and
    justification.
A6  An end user can search by any of the six segments, by title, by ENMAX
    number and by vendor with sub-second response on a 10,000-row dataset.
A7  An end user can check out a Drawing. The Dataverse Checkout row is
    created, the Drawing transitions to CheckedOut, the user becomes the
    Checkout Owner, and no SharePoint operation is invoked. The Drawing
    side panel surfaces the Asset-Unit library URL so the user can
    download and re-upload files directly.
A8  An end user can submit a revision with a new drawing-level revision
    number. The On Revision Submitted flow locates the matching files in
    the Asset-Unit library by deterministic prefix, records their URLs on
    the corresponding Sheet rows, flags any missing sheets on the Drawing,
    and moves the Checkout to AwaitingValidation. The approver and admin
    teams are notified across all three channels.
A9  An approver or admin can validate and approve the check-in. The
    Drawing's Current Revision is bumped, the captured Sheet URLs become
    the canonical hot-links, the Checkout closes, and the user is
    notified. No SharePoint write occurs.
A10 An admin can force a check-in with a reason. The override is audited.
A11 A scheduled flow emits stale-checkout reminders at the 3-month boundary.
A12 The Single Admin Mode flag locks the app to admins, exposes the
    *View as end user* toggle for admins, and surfaces a non-dismissible
    maintenance banner to every authenticated user with configurable
    title, body and severity.
A13 The audit log captures every state transition, every override, every
    config change.
A14 A clean import of the solution package and the seed YAML produces an
    environment that passes every test above.
A15 In-app notifications appear in the bell panel for every approval
    event, validation outcome, stale-checkout reminder and broadcast
    publication targeted at the user. Read state, dismissal and deep
    links work end-to-end.
A16 An admin can author a Broadcast with title, body, severity, audience,
    start, expiry and acknowledgement flag. The hourly fan-out flow
    distributes it to every targeted user without duplicates. Users see
    the broadcast on Home and in the bell panel; they can dismiss
    (or acknowledge, if required); expired broadcasts disappear
    automatically.
A17 Every Code App screen carries the persistent left sidebar, command
    bar above the work surface, header with global search and bell, and
    footer with version, release date, disclaimer and copyright. Every
    grid in the app exposes search, sort, column-level filter, paging,
    column visibility and (admin-only) CSV export.
A18 An admin can seed any (BB,AA,UU,DDD,SSS,KK) sequence per-row in the
    Number Sequences grid, with audit and reason capture after first
    issuance. A bulk CSV import accepts a legacy-migration roster and
    upserts every row atomically. Issuance then begins at
    `max(LastIssued, SeedValue) + 1` and the resulting numbers are
    always 4-digit zero-padded.
A19 Drawing numbers always render as 4-digit zero-padded; sheet numbers
    always render as 3-digit zero-padded; the system refuses to issue a
    drawing beyond 9999 on any combination; a Warning broadcast fires at
    9000 remaining and a Critical broadcast at 9900.
```

UAT acceptance is the same set against the ENMAX tenant, with the addition of a security review pass (Entra app registration scopes, SharePoint Sites.Selected scope, service account permissions) and a data review pass with Heather.

---

## 25. Out of scope and Phase 2 hooks

The following are deferred:

```
- Standards, Procedures and Forms reservation flows
- The three-digit Procedure suffix and the Form-number scheme
- Historical reservation data migration from the legacy SQL Server
- A Power BI replacement for the LCR Daily Report
- Routed approvers by Business or Asset (the data model accepts it)
- InfoLink read integration during the document migration
- Native CAD (.dwg) file handling on the P: drive
- Mobile and external access
- Automated file naming
```

The data model already names a `Record Type` column for the eventual Standards/Procedures/Forms switch; the *Sequence Type* column already accommodates the *Existing Sequence* flow; the *Reservation* table can absorb additional segment columns when Forms arrive without a schema break. These are the only Phase 2 hooks committed in Phase 1.

---

## 26. Risks, assumptions and open questions

### 26.1 Risks

The concurrency plug-in is the single point of correctness for number issuance. A regression here breaks the system silently. Mitigation: the concurrency test runs on every PR, and any change to the plug-in requires a second reviewer.

SharePoint Sites.Selected permission scoping is a known sharp edge. If the service account loses the Read scope on the Generation Drawings site collection, the *On Revision Submitted: Index SharePoint* flow and every Drawing hot-link in the search grid fail. Mitigation: a synthetic monitor flow runs hourly and alerts the admin team on failure.

The shared admin mailbox is a single point of attention. If Heather is away and PBK does not check it, approvals stall. Mitigation: Teams adaptive cards delivered to each admin's and approver's personal chat give the team a second, more visible queue, and the in-app notification feed gives a third.

The 24-hour build window is aggressive. Mitigation: the spec is scoped to Phase 1 only, and the agent-driven workflow is configured for parallelism on independent issues.

### 26.2 Assumptions

The developer tenant has Power Apps and Dataverse capacity available, with the *Enable code apps* environment toggle switched on (Power Platform admin centre → Manage → Environments → [env] → Settings → Product → Features). The service account `eec_pwrplat_svc@enmax.com` exists or can be created in the developer tenant for the duration of the build. The Entra security groups exist or can be created on demand. The ENMAX tenant for UAT has equivalent capacity and the same service account, with the toggle similarly enabled.

Every end user of the published app holds a Power Apps Premium licence. This is a hard prerequisite of the Code Apps platform; standard Microsoft 365 licences are not sufficient. The procurement question for ~70 active users (and the wider ~600 search-only audience) should be raised with ENMAX licensing before UAT. The dev tenant build proceeds against developer-plan licences, which are sufficient for the build itself but cannot back a production rollout.

### 26.3 Open questions for sign-off

These remain unresolved and need a brief decision before build begins.

```
Q1  Does the connection-reference prefix `enmax_connref` satisfy the
    naming intent, or must we strictly preserve `enmax_envar` for both
    environment variables and connection references?
Q2  Confirm the Power Automate bot is approved for 1:1 adaptive card
    delivery to every member of the Approvers and Admins teams. Phase 1
    posts directly to each user's personal chat rather than to a Teams
    channel; this requires the bot to be installed for each recipient.
Q3  Should the *Sites.Selected* SharePoint permission scope cover only the
    Generation Drawings site, or a wider Generation tenant area for future
    use?
Q4  Confirm the developer tenant region for Dataverse so seed scripts can
    target the correct geo endpoint.
Q5  Confirm the email-from address for outbound approval notifications. The
    spec assumes the shared mailbox; an alternative would be the service
    account itself.
Q6  Confirm Power Apps Premium licensing coverage for the ~70 active users
    and the ~600 search-only audience before UAT. Decide whether to provision
    per-user Premium across the population or to use per-app licensing
    (which charges per app per user per month and may be cheaper at scale).
Q7  Confirm the *Enable code apps* environment toggle is on in both the
    developer and the ENMAX UAT tenants. If not, raise a request to a
    Power Platform admin in each tenant before the first publish attempt.
```

---

## 27. Glossary

| Term | Meaning |
|---|---|
| AA | Asset identifier (segment 2 of the number) |
| BB | Business unit identifier (segment 1) |
| Code App | Power Apps Code App; a React-based app packaged for the Power Platform host |
| DDD | Domain identifier (segment 4) |
| KK | Kind identifier (segment 6) |
| MM | Managed Metadata (SharePoint term-set-backed column) |
| MT | Mountain Time |
| nnnn | Four-digit sequential number (segment 7) |
| PAC CLI | Power Platform CLI |
| SSS | System identifier (segment 5) |
| Single Admin Mode | A global App Configuration flag that restricts the app to admins and exposes a *View as end user* toggle |
| Soft validation | A validation that displays an error but allows the user to proceed with a stored reason |
| UU | Unit identifier (segment 3) |

---

## 28. Appendix A: Business taxonomy

| Code | Description |
|---|---|
| GG | Gas Generation |
| DE | District Energy (not currently used) |
| HY | Hydro (not currently used) |
| WD | Wind |
| GW | Generation |
| DG | Distributed Generation (DSTGN & EIESI Business Units) |

## 29. Appendix B: Asset taxonomy and approved BB–AA combinations

| BB | AA | Description |
|---|---|---|
| DG | ST | Distributed Generation – Stoney Transit Facility (EIESI) |
| DG | VS | Distributed Generation – Village Square (DSTGN) |
| GG | CF | Crossfield Energy Centre |
| GG | CG | Calgary Energy Centre |
| GG | CV | Cavalier Energy Centre |
| GG | SH | Shepard Energy Centre |
| GW | GN | Generation fleet-wide application |
| GW | GW | Generation specific application |
| GW | WH | Generation Wholesale / Commercial Energy application |
| WD | KH | Kettles Hill Wind Energy |
| WD | TB | Taber Wind Farm |

The full Asset list (from the Generation Drawing Information workbook) additionally includes `9A` 9th Avenue Centre, `CHP` Combined Heat and Power, `CP` District Energy – Combined Heat & Power, `CS` Calgary Stampede, `ED` District Energy – Edmonton, `EN` Engineering and `WS` Winspear Complex Edmonton. These exist as Asset values but have no approved BB–AA combination in the canonical procedure; they are seeded as Active in the Asset table with no entry in *Approved BB–AA Combination*. The soft-validation override path applies to them at the wizard layer.

## 30. Appendix C: Unit taxonomy

Unit codes are alphanumeric strings, not integers. The seeded values across the canonical Asset combinations are:

```
00, 01, 02, 03, 04, 05, 06, 07, 08, 09,
10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
30, 31, 32, 33, 34, 35, 36, 37,
90, 99,
E0, E1, E2, E3, E4, E5, E6, E7, E8, E9,
EA, EB, EC, ED, EE, EF, EG, EH, EI, EJ, EK, EL, EM, EN, EO,
T0, T1, T2, T3, T4, T5, T6, T7, T8,
XX
```

Asset–Unit mappings (e.g. *Taber Wind Farm 01–37 for turbine units*) are seeded in `enmax_autocadassetunit`.

## 31. Appendix D: Domain taxonomy

```
AES, AMS, ARS, BUD, CAP, CCM, CPM, DOC, ECS, EEL, EIC, EMM, EMP, ENG, ENV,
FIN, FSM, GEN, JVP, MNT, OEM, OHS, OPS, PIR, PMO, QAP, SAF, SCM, WHE, XXX
```

Each carries a description per Attachment 3 of *Numbering Coding Identifiers*. `XXX` is the seed-time placeholder; the application treats it as a real value but renders it muted.

## 32. Appendix E: Kind taxonomy

```
AC, BD, BL, BM, DD, DS, EV, GA, ID, IS, LD, LP, LS, MG, ON, OS, PD, PF, PL,
PR, PS, RC, RL, RT, SC, SD, SL, SP, SS, ST, VD, WD, WL, XX
```

Descriptions are as per Attachment 7 of *Numbering Coding Identifiers*. The applicable-domain hints in that document inform the `System Scoping Rule` table for future expansion.

## 33. Appendix F: Record Type and Record Phase

Record Type values:

```
Drawings
OEM Manuals & Instructions
Turnover Packages
OEM Training
ENMAX Procedures
ENMAX Training
ENMAX Manuals
Packages
XXX
```

Record Phase values:

```
IFC : Issued for Construction
IFD : Issued for Decommissioning
IFR : Issued for Review
IFI : Issued for Implementation
Information
Record
As Built
Inactive
Obsolete
Void
XXX
```

## 34. Appendix G: System term set summary

The System taxonomy is large (roughly 250 codes) and lives in two places: the Dataverse `System` reference table (source of truth for the reservation wizard and search) and the SharePoint *Systems* managed-metadata term set (source of truth for the SharePoint column on the document content type). The seed script populates the Dataverse table from the *Generation Drawing Information Category* workbook in full. Per-facility scoping (Cavalier-only, Shepard-only, DE9-only) and per-domain scoping (ARS-only) are extracted from the description text and written to `System Scoping Rule`. The Dataverse table and the SharePoint term set are kept in sync by an admin-triggered flow in Phase 2; Phase 1 treats the term set as read-only.

The full Code/Description list runs to several hundred rows and is held in `solution/seed/systems.yaml`.

## 35. Appendix H: Vendor term set summary

The Vendor list contains roughly 1,100 values, including a number of hyphenated joint-vendor entries (e.g. *ABB-Koontz Wagner*, *Altalink-SNC Lavalin*). These are seeded as-is into the Dataverse `Vendor` reference table and mirrored to the SharePoint *Vendors* term set. The hyphenated joint entries are preserved as single terms; splitting them into primary + secondary is a Phase 2 conversation with the document control team.

The full Vendor list is held in `solution/seed/vendors.yaml`.

## 36. Appendix I: Email and Adaptive Card templates

### 36.1 Email: New reservation pending approval (to admin queue)

```
Subject: Reservation pending: {{ ReservationId }}: {{ ComposedNumberPreview }}

A new drawing number reservation is awaiting your approval.

  Requested by : {{ Requester.DisplayName }}  ({{ Requester.Email }})
  Reason       : {{ Reason }}
  Composition  : {{ Business.Code }}-{{ Asset.Code }}-{{ Unit.Code }}-
                 {{ Domain.Code }}-{{ System.Code }}-{{ Kind.Code }}
  Count        : {{ Count }}
  Override     : {{ Override ? "Yes: " + OverrideReason : "No" }}

[Approve]   [Decline]   [Open in app →]

Reference: {{ ReservationId }}
```

### 36.2 Email: Reservation approved (to requester)

```
Subject: Approved: {{ ReservationId }}: {{ IssuedRange }}

Your reservation has been approved.

  Numbers issued : {{ IssuedNumbers | join(", ") }}
  Approved by    : {{ Approver.DisplayName }}
  Approved on    : {{ ApprovedOn | datetime }}

[Open in app →]
```

### 36.3 Email: Reservation declined (to requester)

```
Subject: Declined: {{ ReservationId }}

Your reservation has been declined.

  Reason  : {{ DeclineReason }}
  By      : {{ Approver.DisplayName }}

You can edit and resubmit:
[Edit and resubmit →]
```

### 36.4 Adaptive Card: New reservation pending approval (Teams)

```json
{
  "type": "AdaptiveCard",
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "version": "1.5",
  "body": [
    { "type": "TextBlock", "weight": "Bolder", "size": "Large",
      "text": "Reservation pending: {{ ReservationId }}" },
    { "type": "FactSet",
      "facts": [
        { "title": "Requester",  "value": "{{ Requester.DisplayName }}" },
        { "title": "Composition","value": "{{ ComposedNumberPreview }}" },
        { "title": "Count",      "value": "{{ Count }}" },
        { "title": "Reason",     "value": "{{ Reason }}" },
        { "title": "Override",   "value": "{{ Override ? 'Yes: ' + OverrideReason : 'No' }}" }
      ]
    }
  ],
  "actions": [
    { "type": "Action.Submit", "title": "Approve",
      "data": { "verb": "approve", "id": "{{ ReservationId }}" } },
    { "type": "Action.Submit", "title": "Decline",
      "data": { "verb": "decline", "id": "{{ ReservationId }}" } },
    { "type": "Action.OpenUrl", "title": "Open in app",
      "url": "{{ DeepLink }}" }
  ]
}
```

A near-identical template exists for *Check-in pending validation*, swapping vocabulary and adding the *Submitted revision* fact.

---

## 37. Appendix J: Issue backlog seed (initial GitHub issues)

The following issues are created on day one. Each carries acceptance criteria, links to this spec, and (where relevant) a runbook reference. They are arranged in the dependency order from section 18.

```
#001  Scaffold private GitHub repo, CLAUDE.md, CONTRIBUTING, LICENSE, README
#002  Set up GitHub Actions CI baseline (lint, test, build)
#003  Create developer-tenant Power Platform environment   [runbook 003]
#004  Provision service account and grant SharePoint scopes [runbook 001]
#005  Create Entra security groups and Dataverse teams      [runbook 002]
#006  Create solution skeleton with naming-convention bootstrap
#007  Create global option sets for every Choice column
#008  Create reference tables and seed Business/Asset/Unit/Domain/Kind
#009  Create Record Type, Record Phase, Vendor, System tables and seed
#010  Create Approved BB-AA Combination, Asset-Unit, System Scope tables
#011  Implement deterministic-GUID seed loader (Python)
#011a Implement extract_master_data.py (Master data.xlsx → per-table YAML)
#012  Create Number Sequence table and unique index (incl. Seed Value, denormalised lookups, Remaining Capacity, Status)
#012a Code App: Reference Data → Number Sequences grid (seed editor + bulk CSV import + audit)
#013  Implement IssueNumbers Dataverse plug-in (C#) with concurrency test, seed-respecting issuance, and 9999 ceiling enforcement
#014  Create Reservation table and lifecycle
#015  Create Drawing, Checkout, Audit Event tables
#016  Create App Configuration table and seed Phase 1 keys
#017  Code App: scaffold (npx degit Vite template), install @microsoft/power-apps, run power-apps init against dev env, register shell, theme, routing, dark/light. Identity is delegated to the Power Apps host; no app-side auth code
#018  Code App: Home dashboard
#019  Code App: Reservation wizard
#020  Code App: Search
#021  Code App: My Items
#022  Code App: Approvals (admin)
#023  Code App: Reference Data (admin)
#024  Code App: Audit (admin)
#025  Code App: Settings and Single Admin Mode
#025a Code App: Maintenance banner driven by SingleAdminMode
#025b Code App: Persistent footer (version, release date, disclaimer, copyright)
#025c Code App: Notification bell + in-app notification feed panel
#025d Code App: Broadcasts authoring grid (admin)
#025e Code App: Home dashboard surfaces of active broadcasts (all users)
#025f Code App: Model-Driven-style command bar and grid affordances on every grid (search, sort, filter, paging, column visibility, CSV export)
#025g Dataverse: Broadcast + Broadcast Dismissal + In-App Notification tables
#025h Flow: On Broadcast Published → Fan Out In-App Notifications (hourly recurrence)
#025i Flow: On In-App Action Triggered → Mark Read (custom action)
#026  Flow: On Reservation Created → Notify Admins
#027  Flow: On Reservation Approved → Issue Drawings + Notify Requester
#028  Flow: On Reservation Declined → Notify Requester
#029  Flow: On Asset-Unit Activated → Provision SharePoint Library (one-time per Asset-Unit, with the transient Site Owner grant per runbook 004/005)
#030  Flow: On Revision Submitted → Index SharePoint and Notify Approvers (deterministic-prefix scan, capture Sheet URLs, surface missing sheets, three-channel notification)
#031  Flow: On Checkin Approved → Finalise Drawing (bump Current Revision, finalise hot-links, close Checkout, notify user; no SharePoint write)
#032  Flow: On Checkin Declined → Revert (clear captured Sheet URLs, reopen Checkout, notify user)
#033  Flow: Stale Checkout Reminder (Scheduled)
#034  Flow: On Force Checkin → Override + Audit
#035  Flow: On Reference Data Changed → Audit
#036  Email templates and child flows
#037  Teams adaptive card templates and bot wiring   [runbook 008]
#038  Model-driven admin app
#039  End-to-end test suite green against fresh import
#040  UAT deployment runbook + rehearsal              [runbook 010]
```

Each issue is small enough that a single Claude Code session can take it from green-field to merged PR, with verification by a subagent and CI gating.

---

---

## 38. Appendix K: Authoritative Microsoft Learn references

The Code Apps architecture, tooling and limitations in this spec are grounded in the following Microsoft Learn pages. The spec restates the operative points but the canonical statements live at Microsoft.

| Topic | URL |
|---|---|
| Power Apps code apps overview | https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview |
| Code apps architecture | https://learn.microsoft.com/en-us/power-apps/developer/code-apps/architecture |
| Quickstart with the new npm CLI | https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/npm-quickstart |
| Power Apps SDK (npm) | https://www.npmjs.com/package/@microsoft/power-apps |
| PAC CLI reference | https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/ |
| PAC CLI introduction | https://learn.microsoft.com/en-us/power-platform/developer/cli/introduction |
| Dataverse MCP | https://learn.microsoft.com/en-us/power-apps/maker/data-platform/data-platform-mcp |
| Dataverse MCP for other clients | https://learn.microsoft.com/en-us/power-apps/maker/data-platform/data-platform-mcp-other-clients |
| Power Platform Skills (GitHub) | https://github.com/microsoft/power-platform-skills |
| Power Apps Code Apps samples and templates | https://github.com/microsoft/PowerAppsCodeApps |

*End of document.*
