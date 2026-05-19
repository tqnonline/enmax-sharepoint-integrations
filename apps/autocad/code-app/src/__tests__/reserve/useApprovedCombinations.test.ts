import {
  filterAssetsByBusiness,
  filterUnitsByAsset,
  isBusinessAssetApproved,
  type ApprovedCombinations,
} from "../../features/reserve/hooks/useApprovedCombinations";

const COMBOS: ApprovedCombinations = {
  businessAssets: [
    { businessId: "bus-1", assetId: "asset-a" },
    { businessId: "bus-1", assetId: "asset-b" },
    { businessId: "bus-2", assetId: "asset-c" },
  ],
  assetUnits: [
    { assetId: "asset-a", unitId: "unit-1" },
    { assetId: "asset-a", unitId: "unit-2" },
    { assetId: "asset-b", unitId: "unit-3" },
  ],
  systemScopes: [],
};

const ALL_ASSETS = [
  { id: "asset-a", code: "AA", name: "Asset A" },
  { id: "asset-b", code: "AB", name: "Asset B" },
  { id: "asset-c", code: "AC", name: "Asset C" },
  { id: "asset-d", code: "AD", name: "Asset D" },
];

const ALL_UNITS = [
  { id: "unit-1", code: "U1", name: "Unit 1" },
  { id: "unit-2", code: "U2", name: "Unit 2" },
  { id: "unit-3", code: "U3", name: "Unit 3" },
];

// Test 1 — Asset filter on Business change
test("filterAssetsByBusiness returns only approved assets for the given business", () => {
  const result = filterAssetsByBusiness(ALL_ASSETS, "bus-1", COMBOS);
  const ids = result.map((a) => a.id);
  expect(ids).toContain("asset-a");
  expect(ids).toContain("asset-b");
  expect(ids).not.toContain("asset-c");
  expect(ids).not.toContain("asset-d");
});

test("filterAssetsByBusiness returns empty when business has no approved assets", () => {
  const result = filterAssetsByBusiness(ALL_ASSETS, "bus-999", COMBOS);
  expect(result).toHaveLength(0);
});

test("filterUnitsByAsset returns only units linked to the given asset", () => {
  const result = filterUnitsByAsset(ALL_UNITS, "asset-a", COMBOS);
  const ids = result.map((u) => u.id);
  expect(ids).toContain("unit-1");
  expect(ids).toContain("unit-2");
  expect(ids).not.toContain("unit-3");
});

test("isBusinessAssetApproved returns true for approved combo", () => {
  expect(isBusinessAssetApproved("bus-1", "asset-a", COMBOS)).toBe(true);
});

// Test 2 (logic part) — override toggle appears for invalid BB-AA
test("isBusinessAssetApproved returns false for unapproved combo — triggers override toggle", () => {
  expect(isBusinessAssetApproved("bus-1", "asset-c", COMBOS)).toBe(false);
});
