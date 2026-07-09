import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dataSourcesInfo } from "../../../.power/schemas/appschemas/dataSourcesInfo";

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));
vi.mock("../../lib/executeCustomApi", () => ({
  executeCustomApi: (...args: unknown[]) => executeMock(...args),
}));

import { addChildItems } from "../../features/reserve/api/addChildItemsClient";

beforeEach(() => {
  executeMock.mockReset();
});

describe("addChildItemsClient — dataSourcesInfo guard", () => {
  // Same regression guard as customApiDataSource.test.ts but for the reserve client:
  // an operation wired here but missing from the schema fails at runtime with
  // "Operation '<name>' not found in data source '<table>'".
  const clientSource = readFileSync(
    resolve(process.cwd(), "src/features/reserve/api/addChildItemsClient.ts"),
    "utf8",
  );
  const pairRe = /operationName:\s*"([^"]+)"[\s\S]*?tableName:\s*"([^"]+)"/g;
  const calledOps = [...clientSource.matchAll(pairRe)].map((m) => ({
    operationName: m[1],
    tableName: m[2],
  }));
  const schema = dataSourcesInfo as Record<string, { apis?: Record<string, unknown> }>;

  it("discovers the customapi call", () => {
    expect(calledOps.length).toBeGreaterThanOrEqual(1);
  });

  it.each(calledOps)(
    "operation $operationName is declared on data source $tableName",
    ({ operationName, tableName }) => {
      expect(schema[tableName], `data source '${tableName}' missing`).toBeDefined();
      expect(schema[tableName].apis?.[operationName], `operation '${operationName}' missing`).toBeDefined();
    },
  );
});

describe("addChildItems — request/response shape", () => {
  it("binds Drawing via @odata.type + pk and returns the mapped result", async () => {
    executeMock.mockResolvedValue({
      success: true,
      data: {
        ChildrenCreated: 3,
        FirstChildNumber: 4,
        LastChildNumber: 6,
        BaseNumber: "GG-CG-00-ECS-AST-DD-0001",
      },
    });

    const result = await addChildItems({ drawingId: "abc-123", count: 3 });

    const arg = executeMock.mock.calls[0][0];
    expect(arg.operationName).toBe("enmax_acdnAddChildItems");
    expect(arg.tableName).toBe("enmax_acdnaddchilditems");
    // EntityReference must use @odata.type + pk (the bare @odata.id shape does not
    // bind through the power-apps client), same shape as IssueNumbers/approve flow.
    expect(arg.body.Drawing).toEqual({
      "@odata.type": "Microsoft.Dynamics.CRM.enmax_autocaddrawing",
      enmax_autocaddrawingid: "abc-123",
    });
    expect(arg.body.Count).toBe(3);

    expect(result).toEqual({
      childrenCreated: 3,
      firstChildNumber: 4,
      lastChildNumber: 6,
      baseNumber: "GG-CG-00-ECS-AST-DD-0001",
    });
  });

  it("throws with the server message on failure", async () => {
    executeMock.mockResolvedValue({ success: false, error: { message: "Maximum of 999 child items reached." } });
    await expect(addChildItems({ drawingId: "abc-123", count: 1 })).rejects.toThrow("Maximum of 999");
  });
});
