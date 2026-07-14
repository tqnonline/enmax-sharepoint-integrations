# ADR 0005 - Admin solution for UAT test harness flows

- Status: Accepted
- Date: 2026-07-15
- Related: ADR 0004 (flow exception logging), [`flow_catalog.py`](../../solution/scripts/flow_catalog.py), [`deploy_flows.py`](../../solution/scripts/deploy_flows.py), [`Invoke-PpDeploy.ps1`](../../scripts/PowerPlatform.Deploy/Public/Invoke-PpDeploy.ps1)

## Context

`solution/src/Workflows/` shipped three UAT-only harness flows
(`UAT_Seed_SharePoint_Test_PDFs`, `UAT_Teardown_SharePoint_Test_PDFs`,
`UAT_Validate_SharePoint_Index`) inside the same catalog and the same solution
(`enmax_autocadsln`) as the eleven production business flows. Nothing
distinguished "ships to every environment" from "exists only to let a tester
seed/verify/teardown SharePoint fixtures in UAT." A single flow catalog and a
single `--solution` default meant a careless `deploy_flows.py` invocation — or
a CI job that forgot to filter — could push a UAT-only harness into a
production tenant, or (worse) delete/recreate it there during
`--cleanup-orphans`.

Deploy tooling was also split across two entry points that drifted:
`scripts/deploy-user-dev.ps1` (PowerShell, actively maintained) and
`scripts/deploy-user-dev.sh` (bash, macOS/Linux convenience shim). The bash
script duplicated credential resolution, venv bootstrap, and Code App publish
logic with no way to keep the two in sync, and it could not host solution- or
catalog-aware flags without doubling the duplication.

## Decision

1. **Second solution, `enmax_autocadadminsln`** — a minimal Dataverse solution
   under `solution/admin/src/` (own `Other/Solution.xml` +
   `Other/Customizations.xml`, empty `RootComponents`) that owns nothing at
   pack/import time except the solution shell itself. Flow membership is
   added post-import via `deploy_flows.py --catalog admin`, exactly as prod
   flows are added to `enmax_autocadsln` via `--catalog prod` — component
   ownership is a deploy-time concern, not a pack-time one, because
   `pac solution pack` never ships modern flow JSON (ADR 0004, decision 2).

2. **Two flow catalogs, one deploy key per flow** — `flow_catalog.yaml` keeps
   the eleven production flows; `flow_catalog_admin.yaml` holds the three UAT
   harness flows. `flow_catalog.solution_for_slug(slug)` is the single source
   of truth for "which solution owns this flow" (admin catalog membership
   wins). `deploy_flows.py --catalog {prod|admin}` filters
   `_list_flow_dirs()` to only the folders present in the selected catalog —
   a folder that exists on disk but isn't in the selected catalog is never
   touched by that run. This is the mechanism that makes it structurally
   impossible for a `--catalog prod` deploy to create, patch, activate, or
   orphan-cleanup a UAT flow, and vice versa.

3. **Deploy order: prod solution and flows first, admin second** —
   `Invoke-PpDeploy` packs/imports `enmax_autocadsln` and deploys
   `--catalog prod` flows before it ever touches the admin solution. The
   admin solution's UAT flows exist to exercise production plumbing
   (`Child_Log_Flow_Exception`, App Configuration keys, connection
   references) that must already be live; deploying admin first would let a
   UAT harness reference a child flow or config key that doesn't exist yet.

4. **`IncludeAdminSolution` switch, environment-scoped default** — UAT
   harnesses have no reason to exist in `prod`. `Invoke-PpDeploy` and
   `deploy-user-dev.ps1` default `-IncludeAdminSolution` to `$true` for
   `dev`/`uat` and `$false` for `prod` (computed when the caller doesn't bind
   the switch explicitly), so a plain `Invoke-PpDeploy -Environment prod`
   never packs, imports, or deploys the admin solution — an explicit
   `-IncludeAdminSolution` override is required to force it.

5. **PowerShell-only deploy orchestration** — `scripts/deploy-user-dev.sh` is
   deleted. `#Requires -Version 7` on every deploy entry point plus
   `Invoke-PpCli`'s existing `python`/`python3` interpreter fallback already
   cover macOS/Linux without a second, drifting bash implementation. One
   orchestration surface (PowerShell 7, `pwsh` on macOS/Linux) means new flags
   (`-IncludeAdminSolution`, `-DeployFlows`, `--catalog`) are implemented and
   tested once.

## Consequences

- Every new UAT-only flow must be added to `flow_catalog_admin.yaml`, not
  `flow_catalog.yaml`, or it will silently stop deploying anywhere (it won't
  match either catalog's folder filter until it's catalogued).
- `pac solution pack` runs once per solution (`pack.py --solution prod`,
  `pack.py --solution admin`); CI/deploy scripts that assumed a single zip
  path must pass `--solution`.
- Contributors on macOS/Linux now need PowerShell 7 (`pwsh`) installed to run
  any deploy script; there is no bash fallback.
- `enmax_autocadadminsln` is a real solution that must exist in every
  environment where `-IncludeAdminSolution` runs — first import creates the
  shell, subsequent imports/flow deploys are additive.

## Alternatives considered

- **Keep one solution, tag UAT flows for filtered activation only** —
  rejected; the flows would still ship into `enmax_autocadsln` in prod and
  rely on someone remembering to leave them deactivated, which is exactly the
  "careless invocation" failure mode this ADR removes structurally.
- **Delete the UAT harness flows from source instead of relocating them** —
  rejected; they are the only repeatable way to validate the SharePoint
  indexer end-to-end in UAT (ADR 0004's `verify_flow_exception_logging.py`
  companion), and deleting them would remove that coverage.
- **Keep `deploy-user-dev.sh` alongside the PowerShell scripts** — rejected;
  two orchestration implementations for the same deploy chain already drifted
  once (see `IMPORT_SOLUTION`/`FULL` env-var flags in the bash script with no
  PowerShell equivalent) and would drift further with catalog- and
  solution-aware flags added in this change.
