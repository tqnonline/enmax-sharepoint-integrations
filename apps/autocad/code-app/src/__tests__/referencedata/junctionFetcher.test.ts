import { makeJunctionFetcher } from "../../features/referencedata/useRefTableData";
import { REF_TABLES } from "../../features/referencedata/tableConfig";
import type { CompositionMaps } from "../../features/approvals/hooks/useCompositionLookups";
import type { GridFetchParams } from "../../components/DataGrid";

const { retrieveMock } = vi.hoisted(() => ({ retrieveMock: vi.fn() }));
vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({ retrieveMultipleRecordsAsync: retrieveMock }),
}));

const bbaa = REF_TABLES.find(t => t.entityName === "enmax_autocadbusinessassets")!;

const maps: CompositionMaps = {
  bizMap:    new Map([["biz-1", "GG"]]),
  assetMap:  new Map([["ast-1", "CG"]]),
  unitMap:   new Map(),
  domainMap: new Map(),
  sysMap:    new Map(),
  kindMap:   new Map(),
};

const params: GridFetchParams = { search: "", filters: {}, sort: null, page: 0, pageSize: 50 };

afterEach(() => vi.clearAllMocks());

// Regression: the generic fetcher selected enmax_acdncode/displayname on junction
// tables that lack those columns → 400 → "Failed to load table" retry loop.
// The junction fetcher must select only the lookup GUIDs + statecode.
test("junction fetcher selects lookup GUIDs, not code/displayname columns", async () => {
  retrieveMock.mockResolvedValue({ success: true, data: [] });
  await makeJunctionFetcher(bbaa, maps)(params);

  const select = retrieveMock.mock.calls[0][1].select as string[];
  expect(select).toContain("_enmax_acdnbusiness_value");
  expect(select).toContain("_enmax_acdnasset_value");
  expect(select).toContain("statecode");
  expect(select).not.toContain("enmax_acdncode");
  expect(select).not.toContain("enmax_acdndisplayname");
});

// Each lookup GUID resolves to its short code via the composition maps.
test("junction fetcher renders resolved code pair", async () => {
  retrieveMock.mockResolvedValue({
    success: true,
    data: [{
      enmax_autocadbusinessassetid: "ba-1",
      _enmax_acdnbusiness_value: "biz-1",
      _enmax_acdnasset_value: "ast-1",
      "_enmax_acdnbusiness_value@OData.Community.Display.V1.FormattedValue": "Generation",
      "_enmax_acdnasset_value@OData.Community.Display.V1.FormattedValue": "Coal Gen",
      statecode: 0,
    }],
  });

  const { rows } = await makeJunctionFetcher(bbaa, maps)(params);
  expect(rows).toHaveLength(1);
  expect(rows[0].code).toBe("GG–CG");
  expect(rows[0].displayName).toBe("Generation – Coal Gen");
  expect(rows[0].statecode).toBe(0);
});

// Unresolved GUID (maps still loading) falls back to "?" rather than throwing.
test("junction fetcher falls back to ? for unknown GUIDs", async () => {
  retrieveMock.mockResolvedValue({
    success: true,
    data: [{ enmax_autocadbusinessassetid: "ba-2", _enmax_acdnbusiness_value: "unknown", _enmax_acdnasset_value: "ast-1", statecode: 0 }],
  });
  const { rows } = await makeJunctionFetcher(bbaa, maps)(params);
  expect(rows[0].code).toBe("?–CG");
});
