# Model-Driven Apps, Canvas Apps, and When to Use Each

This file covers the three app types available in Power Platform — Code Apps (React/TypeScript), model-driven apps (MDA), and canvas apps — and their relationship to environment variables and connection references. As a skill, this would be loaded when an agent needs to choose the correct app type, configure an MDA, author a canvas app, or wire environment variables and connection references.

For Code Apps specifically, see [code-apps.md](./code-apps.md).

---

## App Type Decision Guide

| Dimension | Code App | Model-Driven App | Canvas App |
|-----------|----------|-----------------|-----------|
| UI control | Full (React components) | Limited (forms, views, charts) | Full (pixel-level drag-and-drop) |
| Data source | Dataverse (primary), REST via fetch | Dataverse only | Dataverse + 400+ connectors |
| Developer skillset | React/TypeScript engineer | Maker / configuration | Maker / low-code |
| When to choose | Complex UX, custom workflows, dynamic components | Data management, forms, standard CRUD, admin surfaces | Citizen dev, multi-connector mashups, mobile forms |
| Security model integration | Custom (role resolution via team membership) | Native (Dataverse roles drive field/form/view visibility) | Partial (connector-based) |
| Delegation | Full server-side via OData | Full server-side | Limited (see below) |
| Environment variable support | No (use App Configuration table) | Yes | Yes |
| Connection reference support | No | Implicit | Yes |

**Choose Code App** when the UX complexity, component reuse, or developer tooling justifies it (CI/CD, unit tests, TypeScript type safety). It is not the right choice for simple forms or admin configuration tables.

**Choose MDA** when the use case is inherently data-centric and role-based (viewing, editing, and approving records), particularly when the Dataverse security model alone can enforce access. MDAs also support business rules, business process flows, dashboards, and charts out of the box.

**Choose Canvas App** when you need pixel-precise layout, multi-connector data mashup, or are enabling citizen developers. Be aware of delegation limits.

---

## Model-Driven Apps

### Key building blocks

| Component | Purpose |
|-----------|---------|
| Forms | Define which columns are visible/editable on a record create/edit screen |
| Views | Define columns and filters for list views of a table |
| Charts | Visualizations bound to a view |
| Dashboards | Composite pages combining views, charts, and iframes |
| Sitemap | Navigation structure of the app |
| Business rules | Client-side/server-side logic without code (show/hide, require, set value) |
| Business process flows | Guided stage-gate workflows displayed on forms |

### Forms

Forms are solution-aware. Each table can have multiple form types (Main, Quick Create, Quick View, Card). Define the Main form for data entry, Quick View for lookup-displayed data.

Column visibility and field behavior can be driven by:
- **Business rules** — declarative conditions (no code)
- **JavaScript web resources** — imperative DOM manipulation (use sparingly; fragile)
- **Security field-level security profiles** — restrict specific sensitive columns to specific roles

### Views

System views are solution-aware and can be exported/imported with the solution. Personal views are user-owned and not solution-aware. Always define the columns and default sort in the system view — do not rely on personal view configuration for required functionality.

### Sitemap

The sitemap defines the navigation areas, groups, and subareas. Each subarea can point to a table (entity) view, a dashboard, a web resource, or a URL.

```xml
<SiteMap>
  <Area Id="pub_mainarea" Title="My Solution">
    <Group Id="pub_group1" Title="Management">
      <SubArea Id="pub_sa_mytable" Entity="pub_mytable"
        Title="My Tables" Icon="/_imgs/ico_16_customentity.png" />
    </Group>
  </Area>
</SiteMap>
```

### Security model integration

MDAs natively respect Dataverse security roles. A user without `prvRead` on a table will not see that table's views in the sitemap. Field-level security can hide or make read-only specific columns based on field security profiles.

This makes MDAs suitable for admin surfaces where you want to leverage the existing role structure without building custom role resolution logic.

---

## Canvas Apps

### Core characteristics

Canvas apps define their layout in a pixel-precise design canvas. Each screen is a collection of controls (Gallery, Form, DataTable, Button, etc.) connected to data sources via Power Fx formulas.

Canvas apps support over 400 connectors including SharePoint, SQL, REST APIs, Office 365, and Dataverse. For Dataverse connectivity, use the Dataverse connector (not the legacy Common Data Service connector).

### Delegation limits

**Delegation** is the ability to push a data operation (filter, sort, count) to the server rather than processing all records client-side. Delegation is critical for large datasets.

Not all Power Fx functions are delegable. Key rules:
- `Filter()` with supported column types and operators: delegable.
- `Search()` on text columns: delegable (Dataverse).
- `Sort()` / `SortByColumns()`: delegable for most column types on Dataverse.
- `CountIf()`, `Sum()`, `Average()`, `Max()`, `Min()`: delegable for Dataverse.
- `Lower()`, `Upper()`, `Trim()` inside a filter: **not delegable** — evaluated client-side.
- Nested formulas combining delegable and non-delegable functions: result is non-delegable.

The default non-delegation limit is 500 records; maximum configurable is 2000. If your canvas app has a gallery or data table showing records from a large table and you need more than 2000 records or accurate filtering, either:
- Use delegation-compatible formulas, or
- Switch to a Code App or model-driven view, or
- Introduce a Power Automate flow to pre-aggregate/filter and return a bounded result.

### Connection references in canvas apps

Canvas apps can reference connection references (shared connector credentials). Configure them via the deployment settings file the same way as flows. See [power-automate-flows.md](./power-automate-flows.md).

---

## Environment Variables

Environment variables are solution-aware configuration values that can be set differently per environment (dev/uat/prod) without changing the solution.

### Characteristics

- Defined in the solution with a **default value** (ships in the solution).
- **Current value** is environment-specific — set via deployment settings on import, never shipped in the managed solution.
- Accessible in: Power Automate flows (`@{parameters('pub_MyVar')}`), model-driven apps (business rules, conditional visibility), canvas apps (as a special data source).
- **NOT accessible from Code Apps** — this is a hard platform constraint. See [code-apps.md](./code-apps.md) for the App Configuration table alternative.

### Defining an environment variable

```xml
<!-- In solution XML: EnvironmentVariableDefinitions/pub_MyVar.xml -->
<environmentvariabledefinition>
  <schemaname>pub_MyVar</schemaname>
  <displayname>My Variable</displayname>
  <type>100000000</type>  <!-- 100000000=String, 100000001=Number, 100000002=Boolean, 100000003=JSON -->
  <defaultvalue>default-value</defaultvalue>
</environmentvariabledefinition>
```

### Setting per-environment values

Via deployment settings file on import:

```json
{
  "EnvironmentVariables": [
    { "SchemaName": "pub_MyVar", "Value": "env-specific-value" }
  ]
}
```

**Never put current values in the managed solution package.** Current values travel via deployment settings so that each environment has its own value.

---

## Connection References

Connection references are solution-aware, shareable connector bindings. Instead of each flow or canvas app directly referencing a connection (which is user-owned and not portable), a connection reference acts as an indirection layer.

### Why connection references matter

Without connection references:
- Flows hard-reference a specific user's connection.
- Importing the solution to a new environment requires manually re-wiring each connection.
- Automated deployments fail if the importing identity doesn't own the connections.

With connection references:
- The connection reference record in the solution maps to a connector type.
- The actual connection (credentials) is bound per-environment via deployment settings.
- Service principal imports can use service-account connections shared via "Can use" permission.

### Deployment settings for connection references

```json
{
  "ConnectionReferences": [
    {
      "LogicalName": "pub_sharedcommondataserviceforapps_XXXX",
      "ConnectionId": "<connection-guid-from-target-env>",
      "ConnectorId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps"
    }
  ]
}
```

Get connection IDs:
```powershell
pac connection list
# Or from Power Apps maker portal: Connections → open a connection → copy the ID from the URL
```

**Connections must be shared with the importing identity ("Can use")** before import. If the flow is imported by a service principal, share the connection with that SPN's application user. Otherwise the flow imports but stays disabled.

### User-delegated connectors

Some connectors (SharePoint, Outlook, Teams) use OAuth user-delegated auth and cannot be owned by a service principal. For these:
1. A human user creates the connection and shares it as "Can use" with the SPN.
2. The SPN imports the solution using the shared connection.
3. All subsequent automated imports continue to use the shared connection.

---

## When to Use Each App Type — Summary

```
Is the use case primarily data management / record CRUD?
  → Model-Driven App

Does it require multi-connector data (SharePoint + Dataverse + REST), pixel layout, or citizen dev authoring?
  → Canvas App

Does it require complex custom UX, TypeScript type safety, unit testing, or CI/CD?
  → Code App
  → Remember: Code Apps cannot read environment variables — use App Configuration table

Does it require synchronous transactional operations (sequence issuance, atomic multi-record writes)?
  → Custom API backed by a plugin (surfaced through whichever app type is appropriate)
```
