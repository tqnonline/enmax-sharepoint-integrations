# Dataverse Foundation

This file covers the core Dataverse building blocks: tables, columns, relationships, option sets, solutions, and the critical Web API rules that govern correct interaction. As a skill, this would be loaded whenever an agent needs to provision schema, query data, or author seed/patch scripts.

For naming conventions, see [naming-conventions.md](./naming-conventions.md). For security roles and BUs, see [security-roles-bu-teams.md](./security-roles-bu-teams.md).

---

## Tables (Entity Metadata)

### Ownership types

| Type | Use when |
|------|---------|
| `UserOwned` | Records have an owner (user or team), record-level security applies, audit trail needed. Correct for almost all transactional tables. |
| `OrganizationOwned` | Shared reference/config data with no per-record security (lookup lists, configuration). |

To create a table via the metadata API:

```json
POST /api/data/v9.2/EntityDefinitions
MSCRM.SolutionUniqueName: YourSolutionName

{
  "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
  "LogicalName": "pub_mytable",
  "SchemaName": "pub_mytable",
  "DisplayName": { "@odata.type": "Microsoft.Dynamics.CRM.Label",
    "LocalizedLabels": [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
      "Label": "My Table", "LanguageCode": 1033 }] },
  "DisplayCollectionName": { ... "My Tables" ... },
  "OwnershipType": "UserOwned",
  "HasActivities": false,
  "HasNotes": false,
  "IsActivity": false,
  "PrimaryNameAttribute": "pub_name",
  "Attributes": [ ... ]
}
```

**Always include `MSCRM.SolutionUniqueName` header** so the table is automatically added to your solution.

### Checking if a table exists

```
GET /api/data/v9.2/EntityDefinitions(LogicalName='pub_mytable')
→ 200 = exists, 404 = does not exist
```

---

## Columns (Attribute Metadata)

### Adding a column to an existing table

```
POST /api/data/v9.2/EntityDefinitions(LogicalName='pub_mytable')/Attributes
```

The `@odata.type` on the attribute payload determines the column type:

| Type | `@odata.type` | Notes |
|------|--------------|-------|
| Single-line text | `Microsoft.Dynamics.CRM.StringAttributeMetadata` | Set `MaxLength` (max 4000) |
| Multi-line text | `Microsoft.Dynamics.CRM.MemoAttributeMetadata` | Set `MaxLength` (max 1,048,576) |
| Whole number | `Microsoft.Dynamics.CRM.IntegerAttributeMetadata` | Set `MinValue`/`MaxValue` |
| Date and time | `Microsoft.Dynamics.CRM.DateTimeAttributeMetadata` | Set `Format`: `DateAndTime` or `DateOnly`; `DateTimeBehavior.Value`: `UserLocal` |
| Boolean | `Microsoft.Dynamics.CRM.BooleanAttributeMetadata` | Include `OptionSet` with `TrueOption`/`FalseOption` |
| Choice (picklist) | `Microsoft.Dynamics.CRM.PicklistAttributeMetadata` | Reference global option set by `Name` |
| Multi-select | `Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata` | Same reference |

### Required level

```json
"RequiredLevel": {
  "Value": "ApplicationRequired",   // or "None"
  "CanBeChanged": true,
  "ManagedPropertyLogicalName": "canmodifyrequirementlevelsettings"
}
```

### Auto-number

Set on a `StringAttributeMetadata` column:
```json
"AutoNumberFormat": "RES-{SEQNUM:00000}"
```

Dataverse manages the counter internally; this is safe for display numbers but not for transactional sequencing (for concurrency-safe issuance see [plugins-and-custom-apis.md](./plugins-and-custom-apis.md)).

---

## Relationships and Lookups

### 1:N (One-to-Many)

The most common relationship type. The "1" side is the **referenced** (parent) entity; the "N" side is the **referencing** (child) entity. The lookup column lives on the child.

```json
POST /api/data/v9.2/RelationshipDefinitions

{
  "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
  "SchemaName": "pub_parent_pub_child",
  "ReferencingEntity": "pub_child",
  "ReferencedEntity": "pub_parent",
  "Lookup": {
    "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
    "SchemaName": "pub_ParentId",
    "LogicalName": "pub_parentid",
    "DisplayName": { ... "Parent" ... },
    "RequiredLevel": { "Value": "None", ... }
  },
  "CascadeConfiguration": {
    "Assign": "NoCascade",
    "Delete": "RemoveLink",   // or "Cascade" for cascade delete
    "Merge": "NoCascade",
    "Reparent": "NoCascade",
    "Share": "NoCascade",
    "Unshare": "NoCascade"
  }
}
```

### Navigation property SchemaName casing for `@odata.bind`

When writing a lookup via the Web API, use the **attribute SchemaName** (PascalCase, as defined when creating the relationship) with `@odata.bind`:

```json
{
  "pub_ParentId@odata.bind": "/pub_parents(<guid>)"
}
```

The entity set name in the value URL is **plural** and matches the table's `EntitySetName` property (not necessarily `<logicalname>s` — verify via metadata). The navigation property key is the attribute schema name, not the logical name.

### System user lookups

To create a lookup to the `systemuser` table:

```json
"ReferencedEntity": "systemuser"
```

The entity set name for `systemuser` is `systemusers`.

---

## Alternate Keys

Alternate keys enable idempotent upsert: PATCH to an alternate key URL either creates or updates the record without needing to look up the GUID first.

```json
POST /api/data/v9.2/EntityDefinitions(LogicalName='pub_mytable')/Keys

{
  "@odata.type": "Microsoft.Dynamics.CRM.EntityKeyMetadata",
  "SchemaName": "pub_mykey_ak",
  "DisplayName": { ... "My Key" ... },
  "KeyAttributes": ["pub_mycolumn"]
}
```

Upsert via alternate key:

```
PATCH /api/data/v9.2/pub_mytables(pub_mycolumn='natural-key-value')
Content-Type: application/json

{ "pub_somefield": "value" }
```

This is the correct pattern for deterministic seed data. See "Deterministic GUID seeding" below.

---

## Option Sets (Global Choices)

### 0 = None is required

Always define option value `0` as `None` (or an equivalent sentinel). This prevents ambiguity between "not set" (null) and an actual value, and ensures exhaustive switch/match coverage.

### Global vs local

- **Global:** reusable across multiple tables/columns. Created at the organization level (`GlobalOptionSetDefinitions`). Preferred for all status, state, and category enums.
- **Local:** scoped to one table and column. Use only when the choice is truly unique to one attribute.

### Creating a global option set

```json
POST /api/data/v9.2/GlobalOptionSetDefinitions
MSCRM.SolutionUniqueName: YourSolution

{
  "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
  "IsGlobal": true,
  "OptionSetType": "Picklist",
  "Name": "pub_drawingstate",
  "DisplayName": { ... "Drawing State" ... },
  "Options": [
    { "Value": 0, "Label": { ... "None" ... } },
    { "Value": 1, "Label": { ... "Available" ... } },
    { "Value": 2, "Label": { ... "Checked Out" ... } }
  ]
}
```

### Patching option set labels after import

Use the `UpdateOptionValue` unbound action (not a PATCH on the definition):

```json
POST /api/data/v9.2/UpdateOptionValue

{
  "OptionSetName": "pub_drawingstate",
  "Value": 1,
  "Label": { "@odata.type": "Microsoft.Dynamics.CRM.Label",
    "LocalizedLabels": [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
      "Label": "Available", "LanguageCode": 1033 }] },
  "MergeLabels": false
}
```

To add a missing value use `InsertOptionValue` (same shape, different action name). After all patches, call `PublishAllXml`:

```json
POST /api/data/v9.2/PublishAllXml
{}
```

This lightweight patch approach avoids a full solution import just to rename option labels.

---

## Solutions

### Managed vs unmanaged

| | Unmanaged | Managed |
|--|----------|--------|
| Environment | Dev / source | UAT / Prod |
| Can edit directly | Yes | No (read-only components) |
| Can be deleted cleanly | Leaves schema behind | Removes all components |
| Source control | Yes, as XML via `pac solution unpack` | Generated artifact only |

**Source-control pattern:** keep the unmanaged solution XML in `solution/src/` (from `pac solution unpack`). Build managed for promotion via `pac solution pack --packagetype Managed`.

### Async import (required for large solutions)

```
pac solution import \
  --path ./out/Solution.zip \
  --settings-file ./settings/<env>.settings.json \
  --publish-changes \
  --activate-plugins \
  --async \
  --max-async-wait-time 60
```

**`--async` is required** to avoid the 30-minute synchronous HTTP channel timeout during upgrade imports. Without it, large solution imports time out at the transport layer even if the import eventually succeeds in the background.

**`--activate-plugins` defaults to false.** If omitted, flows and plugins import in a disabled state.

---

## Web API Rules (Critical Gotchas)

### OData `$skip` is rejected

Dataverse does **not** support offset-based paging via `$skip`. Attempting it returns:

```
{"code":"0x80060888","message":"Skip Clause is not supported in CRM"}
```

**Correct paging:** use `Prefer: odata.maxpagesize=<n>` + `@odata.nextLink` (forward-only cursor):

```
GET /api/data/v9.2/pub_mytables?$select=pub_name&$orderby=createdon asc
Prefer: odata.maxpagesize=50

Response:
{
  "value": [...],
  "@odata.nextLink": "https://.../api/data/v9.2/pub_mytables?$skiptoken=..."
}
```

Pass the `@odata.nextLink` as-is to get the next page. The `$skiptoken` value is opaque — do not parse or construct it.

**Implication for server-side paging in Code Apps:** use `maxPageSize` + `skipToken` options (not `skip`). Cache the token per page number so the user can navigate backward. When search, filter, sort, or page size changes, reset the token cache.

> **Worked example (this repo):** `components/DataGrid/serverPaging.ts` provides `pagedGetAllOptions()` and `pagedResult()` helpers. `EnmaxDataGrid` caches each page's `skipToken` and replays it on prev/next.

### Datetime filter values must be unquoted

String values in OData filters are single-quoted: `$filter=pub_name eq 'foo'`.

Datetime values must **not** be quoted: `$filter=createdon gt 2025-01-01T00:00:00Z`.

Quoting a datetime causes a parse error or silent filter mismatch.

### Enums serialize as the member NAME string

Privilege depths and other Dataverse enum properties serialize as the **member name** (a quoted string), not the integer value:

```json
{ "Depth": "Local" }    // correct
{ "Depth": 1 }          // wrong — 1 is not accepted
```

Valid `PrivilegeDepth` values: `"Basic"`, `"Local"`, `"Deep"`, `"Global"`. See [security-roles-bu-teams.md](./security-roles-bu-teams.md) for context.

### Choice columns and MultiSelectPicklist

- Choice (Picklist): written and read as an integer (`int32`). Serialized in OData as `"pub_state": 2`.
- MultiSelectPicklist: serialized in OData as a comma-delimited string: `"pub_audience": "1,3,5"`.

### Deterministic GUID seeding

For seed/master data that must survive re-runs without creating duplicates, use a **deterministic UUID** derived from a namespace UUID + natural key via UUID v5:

```python
import uuid
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "myproject")

def deterministic_id(table: str, natural_key: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, f"{table}|{natural_key}")
```

Then upsert via PATCH (never POST for seeded data):

```
PATCH /api/data/v9.2/pub_mytables(<computed-guid>)
Content-Type: application/json
If-Match: *    # optional — omit to allow create-or-update

{ "pub_name": "value" }
```

PATCH with a GUID that does not exist creates the record. PATCH with a GUID that exists updates it. This pattern is idempotent and safe to re-run.

> **Worked example (this repo):** `solution/scripts/seed.py` uses `uuid.uuid5(UUID_NAMESPACE, f"{table}|{natural_key}")` where `UUID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "enmax-autocad")`. Lookup references use `@odata.bind` format; choice values are resolved from a pre-loaded option value map.

### Always use `$select`

Never retrieve records without specifying `$select`. Wide tables can have 200+ columns; retrieving all wastes bandwidth and triggers throttling. Always select only the columns you need.

### Solution membership header

When creating or updating metadata (tables, columns, option sets, relationships, keys) via the API, include:

```
MSCRM.SolutionUniqueName: YourSolutionUniqueName
```

Without this header the component is created but not added to any solution, which causes it to be omitted from the solution export.

---

## Step-by-step: add a new table

1. Define the option sets the table's columns will reference (if any): POST to `GlobalOptionSetDefinitions` with the MSCRM solution header.
2. Define the table: POST to `EntityDefinitions` with all column definitions in the `Attributes` array.
3. Define lookup relationships: POST to `RelationshipDefinitions` for each foreign key.
4. Define alternate keys: POST to `EntityDefinitions(<logicalname>)/Keys` for natural-key upsert.
5. Add the table to `deploy.profile.yaml` tables list.
6. Add the entity set name to `power.config.json` `databaseReferences` dataSources map (if a Code App uses it).
7. Run `pac solution export` + `pac solution unpack` to capture the schema change in source control.

---

## Step-by-step: add a new global option set and patch labels

1. Create the option set via `GlobalOptionSetDefinitions` POST (include `0 = None`).
2. After solution import into a target environment, patch any label text differences using `UpdateOptionValue` (or `InsertOptionValue` for new values).
3. Call `PublishAllXml` to activate the changes.
4. Commit the updated option set YAML to the seed directory so the patch script is repeatable.
