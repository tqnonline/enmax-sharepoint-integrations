# Scripts reference

All scripts live in `scripts/`, share `scripts/modules/Inv2Sp.Common.psm1`
for environment config/logging/az-wrapper helpers, and assume an
interactively PIM-elevated `az` session — see
[ADR-0014](../decisions/0014-cicd-deployment-identity-model.md) for why
there's no service-principal/unattended path. Every destructive script
supports `-WhatIf` and/or requires `-Force` to actually act (see the
runbook's note on `ShouldProcess` quirks in this environment).

## Deployment

### `Deploy-All.ps1`
Primary deployment entry point — orchestrates prerequisites,
infrastructure, then workflows in one call.
```
./Deploy-All.ps1 -Environment dev [-Force]
```

### `Deploy-Infrastructure.ps1`
Deploys the Bicep templates (`infra/main.bicep` + the environment's
`.bicepparam`). **Always runs `what-if` first**, even when `-WhatIf` isn't
explicitly passed — the operator sees the diff before confirming a real
deployment.
```
./Deploy-Infrastructure.ps1 -Environment dev -WhatIf   # preview only
./Deploy-Infrastructure.ps1 -Environment dev -Force    # real deploy
```

### `Deploy-Workflows.ps1`
Zip-deploys `workflows/` (host.json, connections.json, every
`wf-*/workflow.json`) via `az logicapp deployment source config-zip`.
Includes a post-deploy health check — **but see the runbook's warning:
this check is not fully trustworthy immediately after deploy**;
independently re-verify with a longer wait.
```
./Deploy-Workflows.ps1 -Environment dev -Force
```

## Go-live control

### `Enable-Triggers.ps1`
Flips the `SCHEDULED_TRIGGER_ENABLED` app-setting kill-switch — the
controlled go-live step (production ships with this off; enable only
after post-deployment validation). See
[the runbook](runbook.md#the-kill-switch-how-trigger-enabledisable-actually-works)
for the full mechanism and why it exists instead of a native
enable/disable API call.
```
./Enable-Triggers.ps1 -Environment dev -Enabled $true
```

## Operating

### `Invoke-OnDemandRun.ps1`
Fires `wf-ondemand-copy` directly and returns the engine's run summary —
the manual "run it now" path, and the resiliency check to run before
`Enable-Triggers.ps1`.
```
./Invoke-OnDemandRun.ps1 -Environment dev
./Invoke-OnDemandRun.ps1 -Environment dev -ShowSourceFolderContents   # diagnostic: what's actually in the source folder right now
```

### `Reset-AbandonedFiles.ps1`
The only supported path back from `Abandoned` — merges a file's
`ProcessedFiles` status back to `Failed` with `AttemptCount` reset to 0,
so the next run treats it as a fresh retry cycle. Deliberately explicit
and auditable, never automatic (see
[ADR-0018](../decisions/0018-retry-abandonment-state-machine.md)).
```
./Reset-AbandonedFiles.ps1 -Environment dev                          # lists all abandoned files, asks before resetting all
./Reset-AbandonedFiles.ps1 -Environment dev -FileName invoice-123.pdf # reset just one
```

### `Clear-FileRunEvents.ps1`
Permanently purges old `FileRunEvents` audit rows (no native TTL on Table
Storage — see [ADR-0028](../decisions/0028-fileRunEvents-retention-cleanup.md)).
Two mutually exclusive modes:
```
./Clear-FileRunEvents.ps1 -Environment dev -OlderThanMonths 3 -WhatIf  # preview: keep current + 2 prior months
./Clear-FileRunEvents.ps1 -Environment dev -OlderThanMonths 3          # real delete, asks to confirm
./Clear-FileRunEvents.ps1 -Environment prod -Month 2026-05 -Force      # exact single-month purge, no prompt
```

## Diagnostics / verification

### `Test-Prerequisites.ps1`
Preflight checks before deploying or operating in an environment: `az`
login + correct subscription, active (not merely PIM-eligible) role on
the resource group, required resource providers registered, Key Vault
reachable with expected secrets present (and not still a bootstrap
placeholder), the Logic App site exists and is running, all 3 API
connections `Connected`.
```
./Test-Prerequisites.ps1 -Environment dev
```

### `Test-Connections.ps1`
Read-only status check on all 3 API connections
(`filesystem`/`filesystem-2`, `sharepointonline`, `office365`). Run this
first whenever something looks wrong — delegated OAuth connections
(SharePoint, email) can be silently revoked by password rotation or a
Conditional Access policy change with no other visible symptom.
```
./Test-Connections.ps1 -Environment dev
```

### `Invoke-PimActivation.ps1`
Self-activates an eligible PIM role assignment via the ARM
`roleAssignmentScheduleRequests` REST API (no `az` CLI-native command
exists for this). Run this at the start of any session after a gap — PIM
elevation is time-bound and expires repeatedly.
```
./Invoke-PimActivation.ps1 -Environment dev
```

### `Set-KeyVaultSecrets.ps1`
Interactively sets Key Vault secrets without ever exposing the value on
the command line, in shell history, or in a process listing — prompts via
`Read-Host -AsSecureString`, writes to a temp file with restrictive
permissions, calls `az keyvault secret set --file`, then securely deletes
the temp file.
```
./Set-KeyVaultSecrets.ps1 -Environment dev
```
