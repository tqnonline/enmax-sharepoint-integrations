# Security Roles, Business Units, and Teams

This file covers the Dataverse security model: privilege definitions, the `ReplacePrivilegesRole` bound action, business unit provisioning, and team membership. As a skill, this would be loaded when an agent needs to author, provision, or verify security roles for a solution.

For privilege naming conventions see [naming-conventions.md](./naming-conventions.md). For deployment commands see [deployment-and-cicd.md](./deployment-and-cicd.md).

---

## Security Model Overview

Dataverse uses a layered security model:
- **Security roles** define what operations (privileges) a user or team can perform on which tables.
- **Business units** (BUs) define an organizational hierarchy that scopes record-level access.
- **Teams** group users and can be assigned roles. Owner teams can own records.

A user's effective privilege is the **union** of all privileges from all their roles across all their team memberships.

---

## Privileges and Depth

A privilege is a combination of an **operation** on a **table** at a **depth** (scope).

### Operations

| Operation | Privilege name prefix | Meaning |
|-----------|----------------------|---------|
| Create | `prvCreate` | Create new records |
| Read | `prvRead` | Read records |
| Write | `prvWrite` | Update existing records |
| Delete | `prvDelete` | Delete records |
| Append | `prvAppend` | Associate (link) this record to another |
| AppendTo | `prvAppendTo` | Allow other records to link to this one |
| Assign | `prvAssign` | Change record owner |
| Share | `prvShare` | Share a record with another user or team |

Full privilege name: `prv<Operation><EntitySchemaName>`. For example: `prvReadpub_drawing`.

### Depth (PrivilegeDepth)

The depth determines which records the privilege covers. **Depth is serialized as the enum member NAME (a quoted string), not an integer.**

| Depth value | Name string | Scope |
|-------------|------------|-------|
| User | `"Basic"` | Only records owned by the calling user |
| Business Unit | `"Local"` | Records owned by anyone in the user's BU |
| Parent-Child BU | `"Deep"` | Records in the BU and all child BUs |
| Organization | `"Global"` | All records in the org |

**Critical:** passing `1` instead of `"Local"` to `ReplacePrivilegesRole` will fail or silently do nothing. Always use the string names.

---

## ReplacePrivilegesRole — Bound Action

`ReplacePrivilegesRole` replaces the **entire** privilege set for a role in one call. It is a bound action on the `roles` entity — the role ID goes in the URL, not the request body.

```
POST /api/data/v9.2/roles(<role-guid>)/Microsoft.Dynamics.CRM.ReplacePrivilegesRole

{
  "Privileges": [
    { "Depth": "Local",  "PrivilegeId": "<prv-guid-1>" },
    { "Depth": "Global", "PrivilegeId": "<prv-guid-2>" },
    { "Depth": "Basic",  "PrivilegeId": "<prv-guid-3>" }
  ]
}
```

**Do not include `RoleId` in the body.** The role is identified by the URL segment. Including it as a body parameter does not cause an error but is redundant and indicates a misunderstanding of bound actions.

To find a privilege ID by name:

```
GET /api/data/v9.2/privileges?$filter=name eq 'prvReadpub_mytable'&$select=privilegeid
```

Cache privilege IDs during a provisioning run — querying once per privilege name is expensive for large role definitions.

> **Worked example (this repo):** `solution/scripts/provision_roles.py` implements this pattern. It pre-caches all privilege IDs in `_priv_cache`, then calls `roles(<id>)/Microsoft.Dynamics.CRM.ReplacePrivilegesRole` with the resolved list. `DEPTH_VALUES` maps YAML labels (`"basic"`, `"local"`, `"deep"`, `"global"`) to the API string names (`"Basic"`, `"Local"`, `"Deep"`, `"Global"`).

---

## Business Units

Every Dataverse environment has exactly one **root business unit**. Child BUs nest under it. All custom application records should be owned under a named child BU, not the root.

### Finding the root BU

```
GET /api/data/v9.2/businessunits?$filter=_parentbusinessunitid_value eq null&$select=businessunitid&$top=1
```

### Idempotent child BU creation

```python
def ensure_business_unit(name: str) -> str:
    existing = find_business_unit(name)          # filter by name
    if existing:
        return existing
    root_id = find_root_business_unit()
    create_business_unit(name, root_id)          # POST with parentbusinessunitid@odata.bind
    created = find_business_unit(name)           # re-query (handles concurrent-creation race)
    if not created:
        raise RuntimeError(f"BU '{name}' could not be found or created")
    return created
```

The re-query after create handles the case where a concurrent provisioning run already created the BU (avoiding duplicate-name errors from a plain "create if not found" check).

**BU lookup `@odata.bind` format:**

```json
{ "parentbusinessunitid@odata.bind": "/businessunits(<root-bu-guid>)" }
```

### Role scoping to a BU

Security roles are scoped to a business unit. When creating a role, bind it to the correct BU:

```json
{
  "name": "Pub - Standard User",
  "description": "...",
  "businessunitid@odata.bind": "/businessunits(<bu-guid>)"
}
```

A user must belong to the same BU (or a child BU) as the role to have the role assigned to them.

---

## Teams

### Owner teams vs access teams

| Type | Can own records | Has roles assigned | Use when |
|------|----------------|-------------------|---------|
| Owner team | Yes | Yes | Group of users who need the same permissions and can share record ownership |
| Access team | No | No | Lightweight sharing: add users to share specific records without changing ownership |

For role-based access control, use **owner teams** with roles assigned. Access teams are for ad-hoc record sharing.

### Creating an owner team

```json
POST /api/data/v9.2/teams

{
  "name": "Pub Approvers",
  "teamtype": 0,
  "businessunitid@odata.bind": "/businessunits(<bu-guid>)"
}
```

`teamtype: 0` = Owner team.

### Assigning a role to a team

Use the `teamroles_association` collection navigation property:

```json
POST /api/data/v9.2/teams(<team-guid>)/teamroles_association/$ref

{ "@odata.id": "/roles(<role-guid>)" }
```

### Adding a member to a team

```json
POST /api/data/v9.2/teams(<team-guid>)/teammembership_association/$ref

{ "@odata.id": "/systemusers(<user-guid>)" }
```

### Querying team membership (for role resolution in Code Apps)

```
GET /api/data/v9.2/teams?
  $filter=teammembership_association/any(m: m/systemuserid eq '<user-guid>')&
  $select=teamid,name
```

This is used in Code Apps to determine if a user belongs to the Admin, Approver, or User team, and thus what role they have. See [code-apps.md](./code-apps.md).

---

## Least-Privilege Principle

Define separate roles for each persona and grant only the privileges that persona genuinely needs. A common set of roles for a business application:

| Role | Typical depth | Notes |
|------|--------------|-------|
| Standard User | Basic (own records) or Local (BU) | Read/write own work items |
| Approver | Local or Deep | Read all items in scope, write status fields |
| Admin | Global | Full access; assign to service accounts and power users only |

Never grant `System Administrator` or `System Customizer` to application end users.

### Service principal application user

The deployment service principal needs elevated privileges to import solutions, register plugins, and provision schema. Assign `System Administrator` or a dedicated deploy role. This user should **not** appear in any end-user team.

After deployment, verify the application user's roles via:

```
GET /api/data/v9.2/systemusers?$filter=applicationid eq '<client-id>'
  &$select=systemuserid,fullname
  &$expand=systemuserroles_association($select=name)
```

---

## Step-by-step: Define a role from a privilege matrix

1. Author a YAML file (`seed/security_roles.yaml`) with the role definitions:

```yaml
business_unit: pub-app-bu

roles:
  - name: Pub - Standard User
    description: Read/write access to Pub tables for standard users
    privileges:
      pub_mytable:
        read:   local
        create: basic
        write:  basic
        delete: none
        append: basic
        appendto: local

  - name: Pub - Admin
    description: Full access to all Pub tables
    privileges:
      pub_mytable:
        read:   global
        create: global
        write:  global
        delete: global
        append: global
        appendto: global
```

2. Run the provisioning script (idempotent):

```powershell
pp-deploy roles --environment dev
```

3. The script:
   - Ensures the child BU exists (creates under root if absent)
   - For each role: finds or creates the role record bound to the BU
   - Resolves privilege IDs by name (with caching)
   - Calls `ReplacePrivilegesRole` to atomically set the full privilege set
   - Logs any unresolvable privilege names (table not yet imported) as warnings, not errors

4. Re-run after every schema change that adds new tables — privilege names for new tables will be resolved on the next run once the table is imported.

---

## Idempotency Pattern

The provisioning pattern is:

```
find(name) → if exists: use existing id
             if not: create → re-find (handles race conditions)
then: replace privileges
```

"Replace" (not "add") is the correct operation because the YAML is the authoritative definition. Running `ReplacePrivilegesRole` is safe to call repeatedly — it is not additive.

Provisioning should be run in CI after every solution import that adds new tables. Missing privilege names (tables not yet in the org) print warnings; the script continues and succeeds. Re-run after the import completes to pick up the new privileges.
