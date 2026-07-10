import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { dataSourcesInfo } from "../../../.power/schemas/appschemas/dataSourcesInfo";

/**
 * Regression guard for the "Operation '<name>' not found in data source '<table>'"
 * class of bug.
 *
 * checkoutClient.ts invokes bound Custom APIs through the Power Apps SDK
 * (`client.executeAsync({ action: "customapi", parameters: { operationName, tableName } })`).
 * The SDK validates `operationName` against the hand-maintained schema in
 * `.power/schemas/appschemas/dataSourcesInfo.ts`. If a new Custom API is wired
 * in the client but its schema entry is forgotten (as happened for
 * enmax_acdnSubmitRevision / FinalizeDrawing / MarkObsolete / MarkVoid), the call
 * fails at runtime even though the code and the Dataverse registration are correct.
 *
 * This test fails the build if any operation the client calls is absent from the
 * schema, so the omission is caught before it ships.
 */
const clientSource = readFileSync(
  resolve(process.cwd(), "src/features/checkout/api/checkoutClient.ts"),
  "utf8",
);
const powerConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), "power.config.json"), "utf8"),
) as {
  databaseReferences: {
    "default.cds": { dataSources: Record<string, unknown> };
  };
};

// Each executeAsync call lists operationName immediately before tableName.
const pairRe = /operationName:\s*"([^"]+)"[\s\S]*?tableName:\s*"([^"]+)"/g;
const calledOps = [...clientSource.matchAll(pairRe)].map((m) => ({
  operationName: m[1],
  tableName: m[2],
}));

interface ApiSchema {
  parameters?: Array<{ name: string }>;
}

const schema = dataSourcesInfo as Record<string, { apis?: Record<string, ApiSchema> }>;

describe("checkoutClient Custom API operations are declared in dataSourcesInfo", () => {
  it("declares every Dataverse source configured by the Code App", () => {
    const configuredSources = Object.keys(
      powerConfig.databaseReferences["default.cds"].dataSources,
    );
    expect(Object.keys(schema)).toEqual(expect.arrayContaining(configuredSources));
  });

  it("discovers the customapi calls in checkoutClient.ts", () => {
    // Sanity: if this drops, the regex (or the file) changed and the guard is silently disarmed.
    expect(calledOps.length).toBeGreaterThanOrEqual(6);
  });

  it.each(calledOps)(
    "operation $operationName is declared on data source $tableName",
    ({ operationName, tableName }) => {
      expect(schema[tableName], `data source '${tableName}' missing from dataSourcesInfo`).toBeDefined();
      expect(
        schema[tableName].apis?.[operationName],
        `operation '${operationName}' missing from '${tableName}'.apis — add it to dataSourcesInfo.ts`,
      ).toBeDefined();
    },
  );

  it("declares ActingUserId on every interactive Custom API", () => {
    const interactiveApis = Object.values(schema)
      .flatMap((source) => Object.entries(source.apis ?? {}))
      .filter(([operationName]) => operationName.startsWith("enmax_"));

    expect(interactiveApis.length).toBeGreaterThan(0);
    for (const [operationName, api] of interactiveApis) {
      expect(
        api.parameters?.map(({ name }) => name),
        `${operationName} must serialize the signed-in user's ActingUserId`,
      ).toContain("ActingUserId");
    }
  });

  it("declares request fields used by lifecycle clients", () => {
    expect(
      schema.enmax_acdnissuenumbers.apis?.enmax_acdnIssueNumbers.parameters?.map(({ name }) => name),
    ).toContain("Reservation");
    expect(
      schema.enmax_acdncheckoutsheets.apis?.enmax_acdnCheckOutSheets.parameters?.map(({ name }) => name),
    ).toContain("BatchId");
    expect(
      schema.enmax_autocadcheckouts.apis?.enmax_acdnForceCheckin.parameters?.map(({ name }) => name),
    ).toContain("NewRevision");
  });
});
