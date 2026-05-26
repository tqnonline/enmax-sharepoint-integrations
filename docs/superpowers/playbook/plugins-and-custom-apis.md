# Plugins and Custom APIs

This file covers Dataverse plugin assembly registration, Custom API definitions, plugin steps, images, and the critical rule for concurrency-safe sequence issuance. As a skill, this would be loaded when an agent needs to author, register, or diagnose a plugin or Custom API.

For naming conventions see [naming-conventions.md](./naming-conventions.md). For deployment see [deployment-and-cicd.md](./deployment-and-cicd.md).

---

## Plugin Assembly Lifecycle

### First-time registration

The plugin assembly must be registered **once** via the Plugin Registration Tool (PRT) or the Power Platform CLI before the automated deploy scripts can manage it. The PRT writes the initial `pluginassemblies` record with metadata including the assembly name and the plugin type records.

```
Plugin Registration Tool → Register New Assembly
  Assembly: <Publisher>.<Product>.dll
  Isolation mode: Sandbox
  → Register Selected Plugins
```

Note the assembly GUID — you will need it if managing the record directly via the API.

After first registration, subsequent builds update the assembly content via an API PATCH (see below). Never re-register from scratch unless you want to lose all Custom API bindings and step definitions.

### Updating the assembly (CI/CD pattern)

After each build, PATCH the assembly record with the new DLL content encoded as base64:

```powershell
# Read and base64-encode the compiled DLL
$dllBytes = [System.IO.File]::ReadAllBytes($dllPath)
$base64   = [System.Convert]::ToBase64String($dllBytes)

# PATCH the existing assembly record
$body = @{ content = $base64 } | ConvertTo-Json
Invoke-RestMethod -Method Patch `
  -Uri "$envUrl/api/data/v9.2/pluginassemblies($assemblyId)" `
  -Headers $headers -Body $body -ContentType "application/json"
```

Find the assembly by name before PATCH to get the current GUID:

```
GET /api/data/v9.2/pluginassemblies?$filter=name eq 'Publisher.Product'&$select=pluginassemblyid
```

If the assembly is absent, fail loudly — do not silently create a duplicate.

---

## Plugin Types

Each public class in the assembly that implements `IPlugin` becomes a plugin type record. The type's `typename` is the fully-qualified class name: `Namespace.ClassName`.

Plugin types are automatically discovered from the assembly content — you do not need to create `plugintypes` records manually via the API if you registered the assembly via PRT. However, when adding new plugin types programmatically, POST to `plugintypes`:

```json
POST /api/data/v9.2/plugintypes

{
  "typename": "Publisher.Product.MyNewPlugin",
  "friendlyname": "My New Plugin",
  "name": "Publisher.Product.MyNewPlugin",
  "pluginassemblyid@odata.bind": "/pluginassemblies(<assembly-guid>)"
}
```

---

## Custom APIs

A Custom API is a first-class Dataverse message that a plugin handles. It is the correct mechanism for custom business logic accessible via the Web API. Do not confuse with Power Automate HTTP triggers or Azure Functions.

### Binding types

| Code | Name | URL format | Target parameter |
|------|------|-----------|-----------------|
| `0` | Global (unbound) | `POST /api/data/v9.2/pub_MyAction` | No Target |
| `1` | Entity-bound | `POST /api/data/v9.2/EntitySetName({id})/Microsoft.Dynamics.CRM.pub_MyAction` | Target provided automatically from URL |
| `2` | EntityCollection-bound | `POST /api/data/v9.2/EntitySetName/Microsoft.Dynamics.CRM.pub_MyAction` | Target is collection |

**`bindingtype` is IMMUTABLE after creation.** PATCH is silently ignored. The only fix for a wrong binding type is delete + recreate. If you accidentally create a Custom API with the wrong binding type, you must delete it, delete the associated request parameters and response properties, and create fresh records.

### Entity-bound URL: two mandatory rules

1. **The `Microsoft.Dynamics.CRM.` namespace prefix is required in the URL.** Omitting it causes `0x80060888 Resource not found` even though the Custom API exists.

   ```
   # Correct
   POST /api/data/v9.2/pub_mytables(<guid>)/Microsoft.Dynamics.CRM.pub_MyAction

   # Wrong — 404
   POST /api/data/v9.2/pub_mytables(<guid>)/pub_MyAction
   ```

2. **Do not register a `Target` request parameter for entity-bound APIs.** The platform provides `Target` automatically from the URL segment. Adding an explicit `Target` parameter causes conflicts.

> **Worked example (this repo):** `enmax_acdnApproveReservation` is entity-bound (`bindingtype=1`) on `enmax_autocadreservation`. The URL is `/api/data/v9.2/enmax_autocadreservations({id})/Microsoft.Dynamics.CRM.enmax_acdnApproveReservation`. The `PluginDefinitions.psd1` entry has `Params = @()` (no Target parameter).

### Creating a Custom API record

```json
POST /api/data/v9.2/customapis

{
  "uniquename": "pub_MyAction",
  "displayname": "My Action",
  "description": "Does something useful",
  "bindingtype": 1,
  "boundentitylogicalname": "pub_mytable",
  "isfunction": false,
  "isprivate": false,
  "allowedcustomprocessingsteptype": 0,
  "plugintypeid@odata.bind": "/plugintypes(<plugin-type-guid>)"
}
```

`allowedcustomprocessingsteptype` values:
- `0` — None (no additional plugin steps can be registered on this message)
- `1` — Synchronous only
- `2` — Asynchronous only
- `3` — Both

### Request parameters

```json
POST /api/data/v9.2/customapirequestparameters

{
  "uniquename": "Reason",
  "name": "Reason",
  "type": 10,
  "isoptional": true,
  "customapiid@odata.bind": "/customapis(<api-guid>)"
}
```

Request parameter type codes: `5` = EntityReference, `7` = Integer, `9` = Picklist, `10` = String.

### Response properties

```json
POST /api/data/v9.2/customapiresponsesevproperties

{
  "uniquename": "NewStatus",
  "name": "NewStatus",
  "type": 7,
  "customapiid@odata.bind": "/customapis(<api-guid>)"
}
```

---

## Plugin Steps

A plugin step registers the plugin type to fire on a specific message/entity combination at a specific stage.

### Step stage codes

| Code | Name | Timing |
|------|------|--------|
| `20` | PreValidation | Before the database transaction; can abort by throwing |
| `40` | PostOperation | After the database write, inside the transaction |
| `50` | PostOperation (async) | After the transaction commits; non-blocking |

### Step mode codes

| Code | Name |
|------|------|
| `0` | Synchronous |
| `1` | Asynchronous |

### Creating a plugin step

```json
POST /api/data/v9.2/sdkmessageprocessingsteps

{
  "name": "pub_MyAction: PostOperation Synchronous",
  "stage": 40,
  "mode": 0,
  "rank": 1,
  "plugintypeid@odata.bind": "/plugintypes(<guid>)",
  "sdkmessageid@odata.bind": "/sdkmessages(<message-guid>)",
  "sdkmessagefilterid@odata.bind": "/sdkmessagefilters(<filter-guid>)"
}
```

For Custom APIs, the `sdkmessageid` is the message created automatically when the Custom API record is saved. Find it:

```
GET /api/data/v9.2/sdkmessages?$filter=name eq 'pub_MyAction'&$select=sdkmessageid
```

### Pre/post images

Images capture the entity state before (pre-image) or after (post-image) the operation, making it available to the plugin without an extra retrieve call.

```json
POST /api/data/v9.2/sdkmessageprocessingstepimages

{
  "name": "PreImage",
  "imagetype": 0,
  "messagepropertyname": "Target",
  "attributes": "pub_state,pub_status",
  "sdkmessageprocessingstepid@odata.bind": "/sdkmessageprocessingsteps(<step-guid>)"
}
```

`imagetype`: `0` = PreImage, `1` = PostImage, `2` = Both.

**Key name pitfall:** When creating image records via the API, use **lowercase** key names for the ID field. The schema name is `sdkmessageprocessingstepimageid` (all lowercase). Passing `sdkmessageprocessingstepimageId` (camelCase) fails silently or causes errors.

---

## Plugin C# Pattern

```csharp
namespace Publisher.Product
{
    public class MyPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)
                serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)
                serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            // Retrieve bound entity reference (entity-bound Custom API)
            var target = context.InputParameters["Target"] as EntityReference;

            // Read a Custom API input parameter
            var reason = context.InputParameters.Contains("Reason")
                ? context.InputParameters["Reason"] as string
                : null;

            // Update a field
            service.Update(new Entity(target.LogicalName, target.Id)
            {
                ["pub_state"] = new OptionSetValue(2),
            });

            // Return a Custom API output parameter
            context.OutputParameters["NewStatus"] = 2;

            // Surface a business error to the caller
            throw new InvalidPluginExecutionException("Human-readable error message");
        }
    }
}
```

**State transition correctness:** when a plugin handles a "decline" or "reject" path, it must explicitly revert any state changes that were made by earlier steps. Do not assume "no update needed" if a previous operation already advanced the state.

> **Worked example (this repo):** `ApproveCheckinPlugin` decline path originally had a comment saying "drawing stays CheckedOut — no update needed". After `submitRevision` was added (which advances drawing to `AwaitingValidation`), the decline path needed to revert the drawing to `CheckedOut`. Both ends of the state machine must be consistent.

---

## Concurrency-Safe Sequence Issuance (Rule 14)

**Never issue sequential numbers or GUIDs from the client side. Never issue them from a non-transactional flow.**

The only correct pattern is:

1. A **Custom API** backed by a **synchronous plugin** (`stage=40 PreValidation` or `stage=40 PostOperation`, `mode=0`).
2. The plugin performs a read-modify-write inside a **database transaction** (Dataverse plugin execution is transactional by default for sync plugins in PreValidation/PostOperation).
3. Use `optimistic concurrency` or the `BusinessUnit + natural key` alternate key pattern to isolate the counter record.

The canonical pattern for a sequence counter:

```csharp
// Inside the plugin (runs in DB transaction)
var counterRecord = service.Retrieve("pub_sequence", sequenceId,
    new ColumnSet("pub_lastissued"));
var lastIssued = (int)(counterRecord["pub_lastissued"] ?? 0);
var newValues = Enumerable.Range(lastIssued + 1, count).ToList();
var updated = new Entity("pub_sequence", sequenceId);
updated["pub_lastissued"] = lastIssued + count;
service.Update(updated);
context.OutputParameters["IssuedNumbers"] = string.Join(",", newValues);
```

Because the plugin runs inside the Dataverse platform transaction, concurrent calls serialize at the database lock level. No external locking or coordination is needed — but the plugin **must** be synchronous.

**Test requirement:** any test suite for issuance must include a concurrent-request test that fires N parallel calls to the Custom API and asserts N distinct, non-overlapping values with no gaps.

---

## Idempotent Registration Pattern

The registration script checks existence before every create:

```powershell
# Find Custom API
$existing = Invoke-RestMethod -Uri "$envUrl/api/data/v9.2/customapis?`$filter=uniquename eq 'pub_MyAction'&`$select=customapiid" -Headers $headers

if ($existing.value.Count -gt 0) {
    $apiId = $existing.value[0].customapiid
    Write-PpLog "Custom API 'pub_MyAction' exists: $apiId"
} else {
    # Create
    $response = Invoke-RestMethod -Method Post -Uri "$envUrl/api/data/v9.2/customapis" `
        -Headers $headers -Body ($definition | ConvertTo-Json -Depth 10)
    $apiId = $response.Headers["OData-EntityId"] -replace '.*\(|\)', ''
}
```

Apply the same pattern for plugin types, steps, and images. Duplicate steps cause double-fire bugs; duplicate images cause double-data in the plugin context.

> **Worked example (this repo):** `scripts/PowerPlatform.Deploy/Data/PluginDefinitions.psd1` lists all Custom APIs with their binding types, parameter types, and response property types. `Register-PpPlugins` loads this file and idempotently reconciles the definitions against the live environment.
