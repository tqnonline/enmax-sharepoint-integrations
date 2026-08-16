import { makeJunctionFetcher } from "../../features/referencedata/useRefTableData";
import { REF_TABLES } from "../../features/referencedata/tableConfig";
import type { CompositionMaps } from "../../features/approvals/hooks/useCompositionLookups";
import type { GridFetchParams } from "../../components/DataGrid";

const { retrieveMock } = vi.hoisted(() => ({ retrieveMock: vi.fn() }));
vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({ retrieveMultipleRecordsAsync: retrieveMock }),
}));

const systemScope = REF_TABLES.find(t => t.entityName === "enmax_autocadsystemscopes")!;

const maps: CompositionMaps = {
  bizMap:    new Map(),
  assetMap:  new Map(),
  unitMap:   new Map(),
  domainMap: new Map(),
  sysMap:    new Map([["sys-1", "ELC"]]),
  kindMap:   new Map(),
};

const params: GridFetchParams = { search: "", filters: {}, sort: null, page: 0, pageSize: 50 };

afterEach(() => vi.clearAllMocks());

// Regression: the generic fetcher selected enmax_acdncode/displayname on junction
// tables that lack those columns → 400 → "Failed to load table" retry loop.
// The junction fetcher must select only the lookup GUIDs + statecode.
test("junction fetcher selects lookup GUIDs, not code/displayname columns", async () => {
  retrieveMock.mockResolvedValue({ success: true, data: [] });
  await makeJunctionFetcher(systemScope, maps)(params);

  const select = retrieveMock.mock.calls[0][1].select as string[];
  expect(select).toContain("_enmax_acdnsystem_value");
  expect(select).toContain("statecode");
  expect(select).not.toContain("enmax_acdncode");
  expect(select).not.toContain("enmax_acdndisplayname");
});

// System scope junction renders system code from composition maps.
test("junction fetcher renders resolved system code", async () => {
  retrieveMock.mockResolvedValue({
    success: true,
    data: [{
      enmax_autocadsystemscopeid: "ss-1",
      _enmax_acdnsystem_value: "sys-1",
      enmax_acdnscopetype: 1,
      enmax_acdnscopevalue: "9A",
      "_enmax_acdnsystem_value@OData.Community.Display.V1.FormattedValue": "Electrical",
      statecode: 0,
    }],
  });

  const { rows } = await makeJunctionFetcher(systemScope, maps)(params);
  expect(rows).toHaveLength(1);
  expect(rows[0].code).toBe("ELC");
  expect(rows[0].displayName).toBe("Electrical");
  expect(rows[0].statecode).toBe(0);
});

// Unresolved GUID (maps still loading) falls back to "?" rather than throwing.
test("junction fetcher falls back to ? for unknown GUIDs", async () => {
  retrieveMock.mockResolvedValue({
    success: true,
    data: [{ enmax_autocadsystemscopeid: "ss-2", _enmax_acdnsystem_value: "unknown", enmax_acdnscopetype: 3, enmax_acdnscopevalue: "", statecode: 0 }],
  });
  const { rows } = await makeJunctionFetcher(systemScope, maps)(params);
  expect(rows[0].code).toBe("?");
});
