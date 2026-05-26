# Naming Conventions

This file is the single source of truth for all naming in a Power Platform solution. Every other playbook file defers here for names. As a skill, this would be loaded by any agent that needs to author or verify names before generating Dataverse schema, code, flows, or deploy configuration.

## Publisher and Customization Prefix

The **customization prefix** is a 2–8 character lowercase string set on the publisher record. It is prepended (with a trailing underscore) to every component you create: tables, columns, option sets, Custom APIs, flows, and environment variables.

**Choose it once. Never rename it.** Renaming requires deleting and recreating every component — Dataverse does not support prefix migration.

Convention: use `pub_` as the placeholder throughout this playbook. Replace `pub` with your actual prefix (e.g. `contoso`, `myco`, `proj`).

| Concept | Generic placeholder | Notes |
|---------|-------------------|-------|
| Customization prefix | `pub` | Lowercase, no underscores or hyphens in the prefix itself |
| Column/table prefix | `pub_` | prefix + underscore |
| Namespace (C#/TS) | `Pub` or `<Publisher>` | PascalCase version of the prefix |

> **Worked example (this repo):** Publisher prefix `enmax_acdn`. All columns use `enmax_acdn` as the prefix (e.g. `enmax_acdnState`, `enmax_acdnKey`). C# namespace is `Enmax.AutoCAD`.

---

## Solutions

| Pattern | Rule |
|---------|------|
| Unique name | PascalCase noun phrase, no spaces: `MySolution`, `ContosoHR` |
| Display name | Human-readable version of the unique name |
| Unmanaged | Used in dev/source environment; source-controlled as packed XML |
| Managed | Deployed to uat/prod; generated from unmanaged via `pac solution pack --packagetype Managed` |

Every component you create should be explicitly added to the solution. Use the `MSCRM.SolutionUniqueName` HTTP header when provisioning via the metadata API to ensure solution membership.

---

## Tables (Entities)

| Element | Convention | Example |
|---------|-----------|---------|
| Logical name | `pub_<entity>` (all lowercase) | `pub_reservation` |
| Schema name | Same as logical for custom tables | `pub_reservation` |
| Display name | Title-case singular noun | `Reservation` |
| Display collection name | Title-case plural noun | `Reservations` |
| Entity set name (OData) | Dataverse pluralizes the logical name + `s` by default; verify via metadata | `pub_reservations` |
| Primary name attribute | Should be meaningful (a human-readable ID or name field) | `pub_reservationid` |

**Ownership type:**
- Use `UserOwned` when records need per-user/team security or audit ownership. This is correct for most transactional tables.
- Use `OrganizationOwned` only for shared reference/configuration data that does not need record-level security.

**Entity set name pitfall:** the OData entity set name is not always `<logicalname>s`. Verify via:
```
GET /api/data/v9.2/EntityDefinitions(LogicalName='pub_mytable')?$select=EntitySetName
```

> **Worked example (this repo):** Table `enmax_autocaddrawing` → entity set name `enmax_autocaddrawings`. Table `enmax_autocadreservation` → entity set name `enmax_autocadreservations`. The entity set name is used verbatim in Code App `power.config.json` and in entity-bound Custom API URLs.

---

## Columns (Attributes)

| Element | Convention | Example |
|---------|-----------|---------|
| Schema name | `pub_<AttributeName>` (PascalCase after prefix) | `pub_State`, `pub_DrawingCount` |
| Logical name | Lowercase of schema name | `pub_state`, `pub_drawingcount` |
| Display name | Title-case label | `State`, `Drawing Count` |

**Type-specific notes:**

| Type | OData type | Notes |
|------|-----------|-------|
| Single line text (String) | `Edm.String` | Specify `MaxLength`; never retrieve without `$select` |
| Multiline text (Memo) | `Edm.String` | Same OData type as String |
| Whole number (Integer) | `Edm.Int32` | Specify `MinValue`/`MaxValue` |
| Choice (Picklist) | `Edm.Int32` | Returned as the integer option value; see option set naming below |
| Multi-select Picklist | `Edm.String` | Returned as a comma-delimited string of integer values |
| Boolean (Two Options) | `Edm.Boolean` | |
| Date and Time | `Edm.DateTimeOffset` | Filter expressions must be **unquoted** (see [dataverse-foundation.md](./dataverse-foundation.md)) |
| Lookup | `_pub_<attr>_value` (system read-only) | Write via `pub_<attr>@odata.bind`: `/pub_tables(<guid>)` |
| Auto-number (String) | `Edm.String` | Set `AutoNumberFormat` on the attribute metadata |

**Lookup column @odata.bind format:** when writing a lookup, do not write to the raw GUID column. Use the navigation property name with `@odata.bind`:

```json
{ "pub_business@odata.bind": "/pub_businesses(<guid>)" }
```

The navigation property name for a lookup is the schema name of the lookup attribute (PascalCase, prefixed). Always verify via the metadata endpoint.

---

## Option Sets (Choices)

| Element | Convention | Example |
|---------|-----------|---------|
| Global option set name | `pub_<entityname>_<attribute>` or just `pub_<concept>` | `pub_drawingstate`, `pub_recordstatus` |
| Option set display name | Title-case phrase | `Drawing State` |
| Option value 0 | Always reserve `0` as `None` / a sentinel | `(0, "None")` |
| Individual option label | Title-case, spaces allowed | `Checked Out`, `Available` |

**Global vs local:** prefer global option sets for any choice that may be reused across tables (state enums, status enums, record categories). Use local option sets only for choices truly unique to one column.

**0 = None is required.** Always include a zero-value `None` or sentinel option. Dataverse choice columns default to null, not zero, but having a defined zero allows explicit "no selection" representation and avoids ambiguity when reading records.

---

## Custom APIs

| Element | Convention | Example |
|---------|-----------|---------|
| Unique name | `pub_<VerbNoun>` (camelCase after prefix) | `pub_IssueNumbers`, `pub_ApproveReservation` |
| Display name | Verb + noun phrase | `Issue Drawing Numbers`, `Approve Reservation` |
| Request parameter name | PascalCase | `Business`, `Count`, `Reason` |
| Response property name | PascalCase | `IssuedNumbers`, `NewStatus` |

**Binding type codes:**

| Code | Name | URL format |
|------|------|-----------|
| `0` | Global (unbound) | `POST /api/data/v9.2/pub_MyAction` |
| `1` | Entity-bound | `POST /api/data/v9.2/EntitySetName({id})/Microsoft.Dynamics.CRM.pub_MyAction` |
| `2` | EntityCollection-bound | `POST /api/data/v9.2/EntitySetName/Microsoft.Dynamics.CRM.pub_MyAction` |

**Request parameter type codes:**

| Code | Type |
|------|------|
| `5`  | EntityReference |
| `7`  | Integer |
| `9`  | Picklist |
| `10` | String |

See [plugins-and-custom-apis.md](./plugins-and-custom-apis.md) for the critical gotcha on entity-bound URLs.

---

## Plugin Assemblies and Types

| Element | Convention | Example |
|---------|-----------|---------|
| Assembly name | `<Publisher>.<Product>` | `Enmax.AutoCAD` |
| Assembly file | `<Publisher>.<Product>.dll` | `Enmax.AutoCAD.dll` |
| Namespace | `<Publisher>.<Product>` | `Enmax.AutoCAD` |
| Plugin class | `<Publisher>.<Product>.<VerbNoun>Plugin` | `Enmax.AutoCAD.IssueNumbersPlugin` |
| Plugin step display | Descriptive phrase | `IssueNumbers: PreValidation Synchronous` |

---

## Security Roles

| Element | Convention | Example |
|---------|-----------|---------|
| Role name | Title-case noun phrase scoped to solution | `Pub - Standard User`, `Pub - Approver` |
| Description | One sentence stating what the role grants | `Grants read/write access to Pub tables for standard users` |

Roles should be defined in a YAML seed file and provisioned idempotently. See [security-roles-bu-teams.md](./security-roles-bu-teams.md).

---

## Business Units

| Element | Convention | Example |
|---------|-----------|---------|
| Child BU name | kebab-case, solution-scoped | `pub-app`, `myco-hr-app` |

Always create child BUs under the root BU. Do not modify the root BU itself.

---

## Environment Variables

| Element | Convention | Example |
|---------|-----------|---------|
| Schema name | `pub_<PascalName>` | `pub_SharedMailboxAddress`, `pub_NotificationEnabled` |
| Display name | Title-case phrase | `Shared Mailbox Address` |

Environment variables are set per environment via deployment settings on import. They are not readable from Code Apps — use the App Configuration table instead (see [code-apps.md](./code-apps.md)).

---

## Connection References

| Element | Convention | Example |
|---------|-----------|---------|
| Logical name | `pub_<Connector>_<uniquifier>` | `pub_sharedcommondataserviceforapps_XXXX` |
| Display name | Connector display name + qualifier | `Dataverse - Pub Solution` |

The `XXXX` suffix is auto-generated by the platform. Logical names are set at creation and cannot be changed. Connection references are solution-aware and must be included in the solution.

---

## Power Automate Flows

| Element | Convention | Example |
|---------|-----------|---------|
| Flow display name | `<Solution> - <Verb> <Noun>` | `Pub - Notify Approver on Submission` |
| Flow JSON filename | `<DisplayName>-<UPPERCASEGUID>.json` | `Pub-NotifyApprover-ABCD1234....json` |
| Action keys in JSON | `Verb_Noun` (underscores, no spaces) | `Get_reservation`, `Send_email` |
| Test flow prefix | `Test_` | `Test_NotifyApproverFlow` |

Action key names must be identifiers — no spaces. Renaming an action requires updating every `runAfter`, `outputs('ActionName')`, and `body('ActionName')` reference in the JSON.

---

## Code App Data Sources

| Element | Convention | Example |
|---------|-----------|---------|
| Data source entry key | Entity set name (plural) | `pub_reservations` |
| `logicalName` | Entity logical name (singular) | `pub_reservation` |
| `isHidden` | `false` unless the table should be invisible in the maker portal | `false` |

Every Dataverse table the Code App reads or writes must appear in `power.config.json` `databaseReferences.default.cds.dataSources`. Include `systemusers` and `teams` unconditionally — they are needed for role resolution. See [code-apps.md](./code-apps.md).

---

## Deploy Tooling

| Element | Convention | Example |
|---------|-----------|---------|
| PowerShell cmdlet | `Verb-PpNoun` (PS approved verb + `Pp` prefix) | `Invoke-PpDeploy`, `Register-PpPlugins` |
| Python CLI entry | `pp-<noun>` | `pp-deploy` |
| Python subcommand | kebab-case verb | `pp-deploy pack`, `pp-deploy import` |
| Profile YAML key | snake_case | `entity_prefix`, `solution_name` |
| GitHub Actions secret | `DATAVERSE_*` | `DATAVERSE_URL`, `DATAVERSE_CLIENT_ID` |
| Local env file | `.env.<env>` | `.env.dev`, `.env.uat` |
