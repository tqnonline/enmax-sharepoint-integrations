# Troubleshooting runbook

## Before anything else: PIM and session state

Every operation in this runbook assumes an active, PIM-elevated `az`
session. PIM elevation is time-bound and **expires repeatedly** — expect
to need `./scripts/Invoke-PimActivation.ps1` after any gap of a few hours,
including within the same day. After a fresh PIM grant, RBAC propagation
can lag — if the very first retry of a permission-gated call fails with
the identical `AuthorizationFailed` error, wait ~45 seconds and retry
before concluding access is genuinely broken.

Also check `az account show` at the start of any session after a break —
the CLI's active identity/tenant context has been observed to silently
drift to an unrelated service account after a long gap. If commands start
failing in ways that don't match the identity you expect, re-run
`az login` explicitly (device code flow if needed) before troubleshooting
anything else.

## Golden rule: never trust a deploy script's immediate health report

`Deploy-Workflows.ps1`'s built-in post-deploy health check can report
`Healthy` even when the deployed definition is genuinely broken — this
happened for a full week in production-adjacent dev testing (see
[ADR-0016](../decisions/0016-workflow-topology-shared-engine.md) and the
incident below). The runtime doesn't always finish validating a new
definition within the script's ~20 second wait, and can report stale
status from the previous, still-being-served version.

**After every deploy:**

1. Wait at least 20-30 seconds beyond what the script itself waits.
2. Independently re-query health yourself (see below) — don't just accept
   the deploy script's own printed report.
3. If you changed action `description` text anywhere, re-scan every
   workflow file for the 1024-character limit (see the incident below) —
   this is silent and will not fail the deployment visibly.

```bash
KEY=$(az functionapp keys list --name <site> --resource-group <rg> \
  --query "systemKeys.workflow_extension" -o tsv)
curl -s -H "x-functions-key: $KEY" \
  "https://<site>.azurewebsites.net/runtime/webhooks/workflow/api/management/workflows/<workflow-name>?api-version=2018-11-01" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('name'), '| isDisabled:', d.get('isDisabled'), '| health:', d.get('health',{}).get('state'))"
```

## Diagnosing a specific run: use the runtime host, never ARM

Every ARM control-plane API for inspecting an individual Standard Logic
App workflow's runs, triggers, or callback URLs is either broken or
blocked in this environment:

- `PATCH .../workflows/{name}` (enable/disable) → Method Not Allowed.
- `az resource invoke-action --action disable` / the hostruntime-proxied
  disable endpoint → `InvalidFlowExtensionRequestRoute`, regardless of
  auth method.
- `.../triggers/{name}/listCallbackUrl` via ARM → bare `Not Found`.
- ARM-proxied folder/file listing on a connection →
  `OperationNotAllowed: only Test Connections are allowed`.

**The one reliable path is the site's own runtime host**, authenticated
with the `workflow_extension` system key:

```
https://{site}.azurewebsites.net/runtime/webhooks/workflow/api/management/workflows/{name}
  [/runs/{runId}
    /actions/{actionName}
      [/repetitions/{6-digit-zero-padded-index}]]
  ?api-version=2018-11-01
```

Get the key: `az functionapp keys list --name <site> --resource-group <rg>
--query systemKeys.workflow_extension -o tsv`.

**Inside a `Foreach`, always query per-repetition** (`/repetitions/000000`,
`/repetitions/000001`, ...) — the aggregate action query for a Foreach
loop does not reliably indicate which iteration it's summarizing, and has
been found actively misleading. Get the list of repetition names from
`.../actions/{parentForeachName}/scopeRepetitions` first.

`./scripts/Invoke-OnDemandRun.ps1 -ShowSourceFolderContents` formalizes
the "does the source folder actually have files" version of this check.

## JSON validity and code review are not sufficient proof of correctness

Multiple real production-logic bugs in this project were only
discoverable by checking live per-action status against real data, never
by JSON-syntax validation or code review alone:

- An invalid `paginationPolicy` against a non-paginated connector response
  silently failed every single run of `List_Files_In_Folder`.
- `"@{...}"` vs. `"@..."` string-interpolation mistakes caused
  `add()`/boolean-comparison type errors that only surface at runtime.
- A misplaced `runAfter` key structurally broke a nested action tree while
  remaining perfectly valid JSON.

**Before considering any workflow change done:** exercise it live against
real data, checked via the per-action/per-repetition query above, and
ideally exercise every branch at least once (empty folder, files present,
subfolders present, a genuine failure, an abandonment).

## Emergency: stop everything, site-wide, immediately

`az webapp stop --name <site> --resource-group <rg>` halts every trigger
on the site immediately and is confirmed clean/reversible
(`az webapp start` to resume). This is a last-resort lever, not the normal
control mechanism — the normal mechanism is the app-setting kill-switch
below.

## The kill-switch: how trigger enable/disable actually works

Because the platform's native per-workflow enable/disable API does not
work at all (see above), gated trigger workflows always stay
platform-`Enabled`, and instead check an app setting
(`SCHEDULED_TRIGGER_ENABLED`) via a `Check_Trigger_Enabled` If-action
before doing anything:

```
equals(toLower(coalesce(appsetting('SCHEDULED_TRIGGER_ENABLED'), 'false')), 'true')
```

`toLower(...)` matters: Bicep's `string(bool)` produces `"True"`/`"False"`
(capitalized), while `az logicapp config appsettings set` produces
lowercase — the expression must tolerate both.

```bash
# Check current state
az functionapp config appsettings list --name <site> --resource-group <rg> \
  --query "[?name=='SCHEDULED_TRIGGER_ENABLED'].value" -o tsv

# Toggle
./scripts/Enable-Triggers.ps1 -Environment dev -Enabled $true|$false
```

### Real incident: the kill-switch was silently non-functional for a week

The `Check_Trigger_Enabled` action's inline `description` field once
exceeded a hard, previously-undocumented **1024-character** platform
limit. When a workflow definition fails this validation, **the runtime
does not error the deployment or refuse to run it — it silently keeps
serving the last-known-good previous version**, with no visible warning
anywhere. The scheduled trigger called the real engine unconditionally
every 15 minutes the entire time, regardless of the app setting's value,
until this was caught (confirmed via run history:
`Check_Trigger_Enabled` returned `WorkflowRunActionNotFound` — it simply
didn't exist in the version actually being served).

**Standing discipline as a result:** keep every action `description` under
1024 characters; after any edit to a workflow file, re-scan all of them
for length before deploying (see
[connectors.md](../design/connectors.md) for the general WDL gotcha list).

## Common ARM quirks worth remembering

- `az deployment group cancel` does **not** cascade to in-flight nested
  deployments — cancel each stuck nested deployment explicitly, by its own
  name.
- `$PSCmdlet.ShouldProcess()` can throw a null-reference
  `MethodInvocationException` in this environment when the confirmation
  prompt would render — and `-Confirm:$false` does **not** reliably
  suppress it despite normally doing so. Every destructive script in this
  repo exposes an explicit `-Force` switch that bypasses `ShouldProcess`
  entirely; use it in non-interactive contexts.
