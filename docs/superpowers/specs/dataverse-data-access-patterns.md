# Dataverse Data Access — Design Direction

**Status:** Adopted  
**Applies to:** All Code App phases from #05 onward  
**Ref:** https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse

---

## 1. Canonical Stack

Every table the Code App reads or writes goes through this stack — no exceptions:

```
Dataverse table
  └── .power/schemas/appschemas/dataSourcesInfo.ts   (auto-generated, one entry per table)
  └── power.config.json → databaseReferences         (one entry per table under default.cds)
  └── src/generated/models/<Table>Model.ts            (auto-generated types)
  └── src/generated/services/<Table>Service.ts        (auto-generated CRUD methods)
  └── src/data/<domain>/use<Thing>.ts                 (hand-written React Query hook)
  └── Component / feature
```

**No component ever imports a generated service directly.** All service calls live in `src/data/` hooks.

---

## 2. Adding a New Table

### 2a. Register the data source

Run from `apps/code-app/`:

```powershell
# PAC CLI (authoritative — updates dataSourcesInfo.ts AND power.config.json)
pac code add-data-source -a dataverse -t <table-logical-name>

# npm CLI equivalent (same effect)
npx power-apps add-data-source --non-interactive --api-id dataverse \
  --resource-name <table-logical-name> --org-url https://m365adm-dev.crm.dynamics.com
```

If the service principal lacks metadata read (HTTP 404 on EntityDefinitions), manually add to both files:

**`dataSourcesInfo.ts`** — append inside the exported object:
```typescript
"<entitySetName>": {
  "tableId": "",
  "version": "",
  "primaryKey": "<logicalName>id",
  "dataSourceType": "Dataverse",
  "apis": {}
}
```

**`power.config.json` → `databaseReferences.default\.cds.dataSources`** — append:
```json
"<entitySetName>": {
  "entitySetName": "<entitySetName>",
  "logicalName": "<logicalName>",
  "isHidden": false
}
```

**Also update `scripts/push-to-dev.ps1`** — the `databaseReferences` hashtable in that script is the source of truth for the pushed manifest; keep it in sync.

> **Why `databaseReferences` must not be empty:** At runtime the portal bridge serves data source configs via `getAppDataSourceConfigsAsync()`. With empty `databaseReferences`, the portal registers no Dataverse connections, that call returns empty, and every `ServiceName.getAll()` returns `{ success: false }`.

### 2b. Generate model + service

The SDK CLI auto-generates these when you run `add-data-source`. If doing it manually, follow the naming convention of existing generated files — do not hand-write these files.

### 2c. Commit generated files

Commit `dataSourcesInfo.ts`, the new `*Model.ts`, and `*Service.ts` together. They are checked into source control — they are not build artifacts.

---

## 3. Reading Data

### Basic read hook

```typescript
// src/data/config/useAppConfigs.ts
import { useSuspenseQuery } from "@tanstack/react-query";
import { Enmax_autocadappconfigsService } from "../../generated/services/Enmax_autocadappconfigsService";
import type { Enmax_autocadappconfigs } from "../../generated/models/Enmax_autocadappconfigsModel";

async function fetchAppConfigs(): Promise<Enmax_autocadappconfigs[]> {
  const result = await Enmax_autocadappconfigsService.getAll({
    select: ["enmax_acdnkey", "enmax_acdnvalue", "enmax_acdnvaluetype"],
  });
  if (!result.success || !result.data) {
    throw new Error(`Fetch failed: ${JSON.stringify(result.error ?? { success: result.success })}`);
  }
  return result.data;
}

export function useAppConfigs() {
  const { data } = useSuspenseQuery({
    queryKey: ["app-configs"],
    queryFn: fetchAppConfigs,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data;
}
```

### Rules

| Rule | Detail |
|------|--------|
| **Always `select`** | Never call `getAll()` without `select`. Fetching all columns is waste and a data-leak risk. |
| **Throw on failure** | Check `result.success && result.data`. If false, throw — never return empty arrays and silently continue. |
| **`useSuspenseQuery` for blocking data** | Config, auth, reference tables. Parent must have a `<Suspense>` boundary. |
| **`useQuery` for non-blocking data** | Lists that can render a skeleton. Use `enabled` to gate on prerequisites. |
| **`staleTime: Infinity`** for reference tables | App config, role lookups, option set metadata — fetch once per session. |
| **`staleTime: 30_000`** for mutable entity lists | Drawings, reservations, sequences. |

### IGetAllOptions delegation

The SDK supports server-side filter, sort, top, skip, and skipToken. **Use them.** Never fetch all records and filter in JS.

```typescript
const result = await DrawingsService.getAll({
  select: ["enmax_acdnnumber", "enmax_acdnstatus", "enmax_acdncreatedon"],
  filter: `enmax_acdnbusiness eq '${businessId}'`,
  orderBy: ["enmax_acdncreatedon desc"],
  top: 50,
});
```

Unsupported: FetchXML, alternate keys, polymorphic lookups (see §6).

---

## 4. Writing Data

### Create

```typescript
const result = await DrawingsService.create({
  enmax_acdnnumber: "...",
  enmax_acdnstatus: 1,
  // Do NOT include the primary key or ownerid — system-managed
});
if (!result.success || !result.data) {
  throw new Error(`Create failed: ${JSON.stringify(result.error)}`);
}
```

### Update — patch only changed fields

```typescript
// WRONG — sends all fields even unchanged ones
await DrawingsService.update(id, { ...fullRecord, enmax_acdnstatus: 2 });

// RIGHT — only the delta
await DrawingsService.update(id, { enmax_acdnstatus: 2 });
```

Sending unchanged fields triggers false audits and may fire business rules unintentionally.

### Delete

```typescript
await DrawingsService.delete(id);
```

### Mutations go through `useMutation`

```typescript
const updateStatus = useMutation({
  mutationFn: ({ id, status }: { id: string; status: number }) =>
    DrawingsService.update(id, { enmax_acdnstatus: status }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["drawings"] }),
});
```

Always invalidate or optimistically update the relevant query cache on success.

---

## 5. Number Issuance — RULE 14 (non-negotiable)

Document numbers are **never** issued from the client. The sequence is:

```
Component → useMutation → Dataverse custom action (enmax_IssueDocumentNumber)
  → IssueNumbers plug-in (C# transactional) → unique number returned
```

Do not call any `SequenceService.create()` or similar from the Code App. The custom action is the only entry point. Tests must fire N parallel calls and assert N distinct numbers.

---

## 6. Lookups

The SDK does not yet have a dedicated lookup API. Use the OData `@odata.bind` pattern on create:

```typescript
// Associate drawing with a business on create
await DrawingsService.create({
  enmax_acdnnumber: "...",
  "enmax_acdnbusiness@odata.bind": `/enmax_autocadbusinesses(${businessId})`,
} as any);
```

On retrieve, expand the navigation property via `select` if the SDK supports it, otherwise use a separate `get` by ID.

---

## 7. Error Handling

All fetch functions must throw on failure — never swallow `result.success === false`.

```
useSuspenseQuery → throws → <Suspense> boundary → <AppErrorBoundary> → ErrorFallback UI
useQuery         → isError → local error state in component
useMutation      → onError → toast / inline error message
```

Log both the raw `result` object and any Zod errors at `console.error` before re-throwing so browser devtools show the root cause.

---

## 8. Configuration — RULE 15 (non-negotiable)

The Code App reads **all** runtime configuration from the `enmax_autocadappconfig` Dataverse table via `useAppConfig()`. Environment variables are invisible to Code Apps. No `import.meta.env.*` for runtime values.

```typescript
// Right
const { teamIdAdmin } = useAppConfig();

// Wrong — always undefined in the portal
const teamId = import.meta.env.VITE_TEAM_ID;
```

---

## 9. Query Key Conventions

```typescript
// Reference / config (session-stable)
queryKey: ["app-config"]
queryKey: ["current-user"]
queryKey: ["user-role", userId]

// Entity lists
queryKey: ["drawings", { businessId, status }]
queryKey: ["reservations", drawingId]

// Single records
queryKey: ["drawing", id]
```

Use object params for filters — avoids order-dependent key bugs.

---

## 10. Testing

- Mock at the **generated service boundary**, not at the SDK or fetch level.
- Use `vi.mocked(SomeService.getAll).mockResolvedValue({ success: true, data: [...] })`.
- Every hook that reads data must have a test for the `success: false` path.
- Number-issuance tests must include a concurrent N-call test asserting N distinct numbers (see Rule 14).

---

## 11. Unsupported (as of @microsoft/power-apps v1.0.3)

- FetchXML
- Alternate keys
- Polymorphic lookups
- Deleting a data source via CLI
- Schema CRUD (entity metadata write)

Work around FetchXML with OData `filter`. Work around polymorphic lookups with individual typed lookups.

---

## Checklist — New Phase Adding a Table

- [ ] `pac code add-data-source -a dataverse -t <logicalName>` (or manual update if 404)
- [ ] `dataSourcesInfo.ts` updated with new entry
- [ ] `power.config.json` `databaseReferences` updated
- [ ] `scripts/push-to-dev.ps1` `databaseReferences` hashtable updated
- [ ] Generated `*Model.ts` and `*Service.ts` committed
- [ ] Custom hook in `src/data/<domain>/` wraps the service
- [ ] Hook tests include `success: false` path
- [ ] `getAll` calls always include `select`
- [ ] Mutations use `useMutation` + cache invalidation
