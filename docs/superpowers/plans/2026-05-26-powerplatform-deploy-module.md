# PowerPlatform.Deploy Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the deploy scripts (3 PowerShell, 8 Python) into a PowerShell module `PowerPlatform.Deploy` (`*-Pp*` cmdlets) and a Python package `powerplatform_deploy` (CLI `pp-deploy`), each over one shared auth/config/REST core, with comment-based help/docstrings, common switches, Pester + pytest, docs, and SharePoint/flow stubs. Behavior-preserving.

**Architecture:** Generic scaffolding; project identity in `deploy.profile.yaml`. Python owns Dataverse REST + YAML schema/seed/roles; PowerShell owns pac CLI / plugin registration / Code-App publish. Spec: `docs/superpowers/specs/2026-05-26-powerplatform-deploy-module-design.md`.

**Tech Stack:** PowerShell 7 module (.psd1/.psm1), Pester. Python 3.11 package (typer CLI, requests, azure-identity/msal, PyYAML), pytest.

**Invariants to preserve (from CD fixes #10–#14):** pac auth before pac ops; async solution import (`--async --max-async-wait-time 60`); `ReplacePrivilegesRole` BOUND to role with `Depth` as PrivilegeDepth enum NAME string; find-or-create BU `enmax-autocad-app`; UTF-8 stdout; never send OData `$skip`; surface Dataverse error bodies (fail-loud).

---

### Task 1: Python package skeleton + shared core

**Files:**
- Create: `solution/scripts/pyproject.toml` (package `powerplatform_deploy`, `[project.scripts] pp-deploy = "powerplatform_deploy.cli:app"`, deps: typer, requests, PyYAML, azure-identity, msal, python-dotenv)
- Create: `solution/scripts/powerplatform_deploy/__init__.py`, `config.py`, `logging.py`, `client.py`
- Create: `deploy.profile.yaml` (repo root): `entity_prefix: enmax_acdn`, `solution_name`, `business_unit: enmax-autocad-app`, `security_roles_file`, `tables: [...24...]`, Code-App `data_sources`
- Test: `solution/scripts/powerplatform_deploy/tests/test_client.py`, `test_config.py`

- [ ] `logging.py`: `get_logger(name)` configuring UTF-8 stdout (reconfigure), level via `--verbose`.
- [ ] `config.py`: `load_env(environment)` reads `apps/code-app/.env.<env>` (worktree fallback to main repo via git-common-dir) → returns dict with DATAVERSE_URL/CLIENT_ID/CLIENT_SECRET/TENANT_ID (mapped from ENVIRONMENT_URL/CLIENT_ID/CLIENT_SECRET/TENANT_ID); also reads `os.environ` (env wins). `load_profile()` reads `deploy.profile.yaml`.
- [ ] `client.py`: `DataverseClient(url, token)` with `_get/_post` that **raise with `resp.text`** on non-2xx (fail-loud); `from_env(cfg)` builds token via client-credentials (msal/azure-identity); helpers used across commands (`retrieve_multiple`, `execute_action`).
- [ ] pytest: `_post` surfaces error body; `load_env` parsing + fallback; profile load. Run `pytest`.
- [ ] Commit.

### Task 2: Python CLI + solution-lifecycle commands (pack/import/export)

**Files:** Create `powerplatform_deploy/cli.py`, `commands/__init__.py`, `commands/pack.py`, `commands/import_.py`, `commands/export.py`. Reference (preserve behavior): existing `solution/scripts/pack.py`, `import.py`, `export.py`.

- [ ] `cli.py`: typer `app` with shared options `--environment` (required), `--dry-run`, `--verbose`; one subcommand per command module.
- [ ] `import_.py`: preserve `pac solution import --publish-changes --activate-plugins --async --max-async-wait-time 60` (invariant). `pack.py`/`export.py`: wrap existing logic.
- [ ] `pp-deploy import --environment dev --dry-run` prints intended action; real run matches old import.py. Manual/py check.
- [ ] Commit.

### Task 3: Python data/security commands (seed/roles/optionsets)

**Files:** Create `commands/seed.py`, `commands/roles.py`, `commands/optionsets.py` using the shared `DataverseClient`. Reference: `seed.py`, `provision_roles.py`, `patch_optionsets.py`.

- [ ] `roles.py`: preserve the #14 fixes — `ReplacePrivilegesRole` bound (`roles(<id>)/Microsoft.Dynamics.CRM.ReplacePrivilegesRole`), `Depth` = enum NAME string, find-or-create BU, correct table names (read from profile). Move depth map + bound call into client/command.
- [ ] `seed.py`, `optionsets.py`: wrap existing, use shared client (drop per-file auth/env).
- [ ] pytest regressions: bound URL, enum-name depth, BU find-or-create. Run `pytest`.
- [ ] Commit.

### Task 4: Python schema/extract commands + SP/flow stubs

**Files:** Create `commands/schema.py` (← provision_schema.py, 964 lines — wrap, share client), `commands/extract.py` (← extract_master_data.py), `commands/sharepoint.py` (stub), `commands/flows.py` (stub).

- [ ] `schema.py`/`extract.py`: wrap existing, share client/config/logging.
- [ ] `sharepoint.py`: validated args + documented `NotImplementedError` describing intended Graph/SP library provisioning (plan-11 B4).
- [ ] `flows.py`: stub for flow enable/connection-reference wiring.
- [ ] `pp-deploy --help` lists all subcommands. pytest stubs raise clearly. Commit.

### Task 5: PowerShell module skeleton + shared core + Connect-PpDataverse

**Files:** Create `scripts/PowerPlatform.Deploy/PowerPlatform.Deploy.psd1`, `.psm1`, `Private/Get-PpEnvConfig.ps1`, `Private/Get-PpProfile.ps1`, `Private/Write-PpLog.ps1`, `Private/Assert-PpExitCode.ps1`, `Public/Connect-PpDataverse.ps1`, `Tests/Connect-PpDataverse.Tests.ps1`. Reference: `push-to-dev.ps1` auth block.

- [ ] `.psm1` dot-sources Private+Public, exports Public. `.psd1` manifest (version 0.1.0, FunctionsToExport).
- [ ] `Get-PpEnvConfig -Environment`: `.env.<env>` + worktree fallback (← push-to-dev). `Connect-PpDataverse -Environment [-WhatIf]`: idempotent pac auth. Comment-based help + `.EXAMPLE` on every public cmdlet.
- [ ] Pester: `Get-PpEnvConfig` parsing/fallback; `Connect-PpDataverse -WhatIf` no-op (mock `pac`). Run `Invoke-Pester`.
- [ ] Commit.

### Task 6: PowerShell cmdlets — Publish-PpCodeApp, Register-PpPlugins, Invoke-PpDeploy

**Files:** Create `Public/Publish-PpCodeApp.ps1` (← push-to-dev build/power.config/push), `Public/Register-PpPlugins.ps1` (← deploy-plugins.ps1, 487 lines — preserve its MSAL token + idempotent registration), `Public/Invoke-PpDeploy.ps1` (orchestrator ← deploy-local: Connect → pack → import → plugins → optionsets → seed → roles → publish), `Tests/*.Tests.ps1`.

- [ ] All cmdlets: `-Environment`, `-WhatIf`/`-Confirm` (SupportsShouldProcess on state-changers), `-Verbose` via Write-PpLog, comment-based help + examples.
- [ ] `Invoke-PpDeploy` calls the Python CLI for python steps + the PS cmdlets for pac/app steps.
- [ ] Pester for param validation + `-WhatIf`. Run `Invoke-Pester`.
- [ ] Commit.

### Task 7: Rewire CD + shims

**Files:** Modify `.github/workflows/cd-{dev,uat,prod}.yml`, `scripts/deploy-local.ps1`, `scripts/push-to-dev.ps1`, `scripts/deploy-plugins.ps1`.

- [ ] CD: install the package (`pip install -e solution/scripts` or `uv pip install`), import the PS module; steps call `pp-deploy <cmd> --environment <env>` + `Register-PpPlugins`/`Publish-PpCodeApp`. Keep granular steps.
- [ ] `deploy-local.ps1` → thin wrapper over `Invoke-PpDeploy -Environment`; `push-to-dev.ps1`/`deploy-plugins.ps1` → thin shims calling the cmdlets (one release) or removed with refs updated.
- [ ] Validate locally: `Invoke-PpDeploy -Environment dev` reproduces the green e2e. Commit.

### Task 8: Docs + help audit

**Files:** Create `docs/deploy/README.md`, `docs/deploy/reference.md`, `docs/deploy/examples.md`.

- [ ] README: quickstart, prerequisites, env files, the surface table (cmdlet ↔ CLI ↔ old script). Reference: every cmdlet `Get-Help` summary + every `pp-deploy` subcommand `--help`. Examples per environment.
- [ ] Verify `Get-Help <cmdlet> -Examples` works for all; `pp-deploy --help` complete.
- [ ] Commit.

---

## Self-review
- Spec coverage: cores (T1/T5), commands (T2–T4), cmdlets (T6), rewire (T7), tests (T1/T3/T5/T6), docs+stubs (T4/T8) — all mapped.
- Invariants (#10–#14) called out in T2/T3/T6.
- Behavior-preserving: each task wraps existing logic; T7 validates against the known-green local e2e.
