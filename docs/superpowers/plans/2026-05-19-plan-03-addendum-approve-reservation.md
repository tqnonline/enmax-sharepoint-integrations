# Plan #03 Addendum — Plugin Registration Runbook (Both Custom APIs)

**Date:** 2026-05-19
**Owner:** Rahul Akmol
**Extends:** `2026-05-17-plan-03-issuenumbers-plugin.md`
**Covers:** Full step-by-step registration of both plugins in the `Enmax.AutoCAD` assembly

---

## Assembly Summary

Both plugins compile into a single DLL:

| Item | Value |
|------|-------|
| Project | `solution/plugins/IssueNumbers/IssueNumbers.csproj` |
| Output DLL | `bin/Release/net462/Enmax.AutoCAD.dll` |
| Strong-name key | `IssueNumbers.snk` |

| Plugin | Namespace | Fully-qualified type (for PRT) |
|--------|-----------|-------------------------------|
| IssueNumbers | `IssueNumbers` | `IssueNumbers.IssueNumbersPlugin, Enmax.AutoCAD` |
| ApproveReservation | `Enmax.AutoCAD` | `Enmax.AutoCAD.ApproveReservationPlugin, Enmax.AutoCAD` |

---

## Prerequisites

- PAC CLI authenticated to dev tenant (`pac auth list` shows the org URL)
- Plugin Registration Tool available: `pac tool prt`
- System Customizer or System Administrator role on dev tenant
- Solution `enmaxautocadsln` exists in dev tenant (unmanaged)
- Table `enmax_autocadreservation` exists (plan #02 prerequisite)
- Table `enmax_autocadnumbersequence` exists with alternate key on `enmax_acdnsequencekey` (plan #02 prerequisite)

---

## Step 1 — Build the Assembly

```powershell
Set-Location solution/plugins/IssueNumbers
dotnet build --configuration Release
```

Expected output:
```
Build succeeded.
  IssueNumbers -> ...\bin\Release\net462\Enmax.AutoCAD.dll
```

Keep the path to the DLL — you will need it in Step 4.

---

## Step 2 — Register Custom API: IssueNumbers

> This creates the OData action message `enmax_acdnIssueNumbers`.
> Skip if already registered from plan #03. Verify by checking
> `Solutions → Enmax AutoCAD → Custom APIs` for `enmax_acdnIssueNumbers`.

1. Open `https://make.powerapps.com` → select dev environment
2. **Solutions → Enmax AutoCAD Document Numbering System**
3. **New → Automation → Custom API**
4. Fill in the **Custom API** record:

   | Field | Value |
   |-------|-------|
   | Unique Name | `enmax_acdnIssueNumbers` |
   | Display Name | `Issue ENMAX Numbers` |
   | Description | `Concurrency-safe drawing number issuance` |
   | Binding Type | **Global (unbound)** |
   | Is Function | **No** |
   | Allowed Custom Processing Step Type | **SyncAndAsync** |
   | Is Private | No |
   | Enabled For Workflow | Yes |

5. **Save**

6. Add **Request Parameters** (input arguments). For each row below, click **New Custom API Request Parameter**:

   | Unique Name | Display Name | Type | Required |
   |-------------|--------------|------|----------|
   | `Business` | Business Code | String | Yes |
   | `Asset` | Asset Code | String | Yes |
   | `Unit` | Unit Code | String | Yes |
   | `Domain` | Domain Code | String | Yes |
   | `System` | System Code | String | Yes |
   | `Kind` | Kind Code | String | Yes |
   | `Count` | Count | Integer | Yes |

7. Add **Response Properties** (output arguments). For each row below, click **New Custom API Response Property**:

   | Unique Name | Display Name | Type |
   |-------------|--------------|------|
   | `IssuedNumbers` | Issued Numbers | String |
   | `SequenceKey` | Sequence Key | String |
   | `NewLastIssued` | New Last Issued | Integer |
   | `Status` | Status | Picklist |

   > For `Status`, set the OptionSet to `enmax_acdn_numbersequencestatus`.

8. **Save and Close**

---

## Step 3 — Register Custom API: ApproveReservation

> This creates the OData action message `enmax_acdnApproveReservation`.
>
> **Important:** Register as **Global (unbound)** — NOT entity-bound.
> The plugin reads `Target` from `InputParameters` directly, so Dataverse must see
> it as an explicit registered parameter. Entity-bound Custom APIs inject `Target`
> implicitly (never in `InputParameters`), which causes
> "Unrecognized request parameter: Target" (0x80040315) from the SDK.

1. Still inside **Solutions → Enmax AutoCAD Document Numbering System**
2. **New → Automation → Custom API**
3. Fill in the **Custom API** record:

   | Field | Value |
   |-------|-------|
   | Unique Name | `enmax_acdnApproveReservation` |
   | Display Name | `Approve Reservation` |
   | Description | `Atomically approves a pending reservation and stamps approver + timestamp` |
   | Binding Type | **Global (unbound)** |
   | Is Function | **No** |
   | Allowed Custom Processing Step Type | **SyncAndAsync** |
   | Is Private | No |
   | Enabled For Workflow | Yes |

4. **Save**

5. Add **one Request Parameter** — click **New Custom API Request Parameter**:

   | Unique Name | Display Name | Type | Bound Table | Required |
   |-------------|--------------|------|-------------|----------|
   | `Target` | Target Reservation | EntityReference | `enmax_autocadreservation` | Yes |

6. **Save and Close**

> If `enmax_acdnApproveReservation` was already registered as Entity-bound:
> delete that Custom API record (and its step in PRT), then re-create from scratch
> following this step. Entity→Global cannot be changed in-place.

---

## Step 4 — Register Assembly in Plugin Registration Tool

```powershell
pac tool prt
```

### 4a — Connect to tenant

1. **Create new connection**
2. Enter org URL (e.g. `https://<dev-org>.crm3.dynamics.com`)
3. Sign in with your admin credentials
4. Click **Login**

### 4b — Register the assembly (first time on this tenant)

1. **Register → Register New Assembly**
2. Browse to:
   ```
   solution\plugins\IssueNumbers\bin\Release\net462\Enmax.AutoCAD.dll
   ```
3. PRT scans the DLL and lists discovered plugin classes:
   - ✅ `IssueNumbers.IssueNumbersPlugin`
   - ✅ `Enmax.AutoCAD.ApproveReservationPlugin`
4. Ensure both are checked
5. Set:
   - **Isolation Mode:** Sandbox
   - **Location (Store):** Database
6. Click **Register Selected Plugins**

### 4b — Update existing assembly (if IssueNumbers was already registered as `IssueNumbers.dll`)

1. In the assembly tree, find the old `IssueNumbers` assembly entry
2. Right-click → **Update**
3. Browse to `Enmax.AutoCAD.dll`
4. PRT detects the renamed assembly and the new `ApproveReservationPlugin` class
5. Accept — existing `IssueNumbersPlugin` step remains linked; only the assembly record updates
6. If PRT does not auto-detect `ApproveReservationPlugin`, right-click the assembly → **Register New Plugin** → select `Enmax.AutoCAD.ApproveReservationPlugin`

---

## Step 5 — Register Plugin Step: IssueNumbers

> Skip if the step already exists and is pointing to the updated assembly.

In PRT, expand `Enmax.AutoCAD` assembly → expand `IssueNumbers.IssueNumbersPlugin` → **Register New Step**:

| Field | Value |
|-------|-------|
| Message | `enmax_acdnIssueNumbers` |
| Primary Entity | *(none — unbound)* |
| Secondary Entity | *(none)* |
| Filtering Attributes | *(leave blank)* |
| Stage | **PostOperation** |
| Execution Mode | **Synchronous** |
| Deployment | Server Only |
| Execution Order | 1 |
| Run in User's Context | **Calling User** |

Click **Register Step**.

---

## Step 6 — Register Plugin Step: ApproveReservation

In PRT, expand `Enmax.AutoCAD` assembly → expand `Enmax.AutoCAD.ApproveReservationPlugin` → **Register New Step**:

| Field | Value |
|-------|-------|
| Message | `enmax_acdnApproveReservation` |
| Primary Entity | `enmax_autocadreservation` |
| Secondary Entity | *(none)* |
| Filtering Attributes | *(leave blank)* |
| Stage | **PostOperation** |
| Execution Mode | **Synchronous** |
| Deployment | Server Only |
| Execution Order | 1 |
| Run in User's Context | **Calling User** |

Click **Register Step**.

---

## Step 7 — Export Solution and Commit

After both steps are registered, capture the registration metadata in source control:

```powershell
# Export unmanaged solution
pac solution export `
  --path solution/build/enmaxautocadsln_unmanaged.zip `
  --name enmaxautocadsln `
  --managed false

# Unpack into solution/src/
pac solution unpack `
  --zipfile solution/build/enmaxautocadsln_unmanaged.zip `
  --folder solution/src `
  --packagetype Unmanaged `
  --allowDelete true

# Verify expected files are present
git diff --stat solution/src/
# Expected additions:
#   solution/src/CustomAPIs/enmax_acdnIssueNumbers/
#   solution/src/CustomAPIs/enmax_acdnApproveReservation/
#   solution/src/CustomAPIRequestParameters/   (7 rows for IssueNumbers)
#   solution/src/CustomAPIResponseProperties/  (4 rows for IssueNumbers)
#   solution/src/PluginAssemblies/             (Enmax.AutoCAD entry)
#   solution/src/SdkMessageProcessingSteps/    (2 step entries)

git add solution/src/CustomAPIs/
git add solution/src/CustomAPIRequestParameters/
git add solution/src/CustomAPIResponseProperties/
git add solution/src/PluginAssemblies/
git add solution/src/SdkMessageProcessingSteps/
git commit -m "feat(plugin): register IssueNumbers + ApproveReservation Custom APIs and steps"
```

---

## Step 8 — Verify Both Registrations

### 8a — Unit tests (no Dataverse required)

```powershell
Set-Location solution/plugins/IssueNumbers.Tests
dotnet test --filter "Category!=Integration"
# Expected: 28 passed (22 IssueNumbers + 6 ApproveReservation), 0 failed
```

### 8b — Smoke test: IssueNumbers

```powershell
$orgUrl = "https://<dev-org>.crm3.dynamics.com"
$token  = "<bearer-token>"   # obtain via az account get-access-token or Postman

Invoke-RestMethod `
  -Method POST `
  -Uri "$orgUrl/api/data/v9.2/enmax_acdnIssueNumbers" `
  -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
  -Body '{"Business":"GG","Asset":"CG","Unit":"00","Domain":"ECS","System":"AST","Kind":"DD","Count":1}'

# Expected: HTTP 200 with body containing IssuedNumbers, SequenceKey, NewLastIssued, Status
```

### 8c — Smoke test: ApproveReservation

```powershell
# First create a reservation with status=1 (Pending), note its GUID
$reservationId = "<pending-reservation-guid>"

Invoke-RestMethod `
  -Method POST `
  -Uri "$orgUrl/api/data/v9.2/enmax_autocadreservations($reservationId)/Microsoft.Dynamics.CRM.enmax_acdnApproveReservation" `
  -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
  -Body "{}"

# Expected: HTTP 204 No Content
# Verify in Dataverse:
#   enmax_acdnstatus       = 2 (Approved)
#   enmax_acdnapprovedon   = populated
#   enmax_acdnapprover     = your user GUID

# Idempotency check — call again on the same reservation
# Expected: HTTP 204, no error, row unchanged
```

### 8d — Integration / concurrency test (requires `.env.dev` loaded)

```powershell
# Load .env.dev into session
Get-Content apps\code-app\.env.dev |
  Where-Object { $_ -match '^[A-Z]' } |
  ForEach-Object {
    $k, $v = $_ -split '=', 2
    [System.Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim().Trim('"'))
  }

Set-Location solution/plugins/IssueNumbers.Tests
dotnet test --filter "Category=Integration"
# Expected: 2 integration tests pass; ~30-60 seconds
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Step 8b returns 404 | Custom API not registered or wrong message name | Re-check Step 2; confirm `enmax_acdnIssueNumbers` exists in solution Custom APIs |
| Step 8c returns 404 | Custom API not registered or entity binding wrong | Re-check Step 3; confirm binding is `enmax_autocadreservation` |
| Step 8b/8c returns 400 with "plug-in assembly not found" | Assembly not registered or wrong DLL path in PRT | Repeat Step 4; ensure `Enmax.AutoCAD.dll` is in Database storage |
| Step 8b/8c returns 400 with "no plug-in step registered" | Step missing or wrong message name in PRT | Repeat Step 5 or 6; verify Message name matches exactly |
| PRT shows `IssueNumbers.dll` instead of `Enmax.AutoCAD.dll` | Old plan #03 assembly still registered | Update assembly per Step 4b; do not register a second assembly |
| Integration test: `Requires Dataverse connection` | Env vars not set | Run the `Get-Content .env.dev` block in Step 8d first |
