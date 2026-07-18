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

import { issueNumbers } from "../../features/reserve/api/issueNumbersClient";

beforeEach(() => {
  executeMock.mockReset();
});

describe("issueNumbersClient — dataSourcesInfo guard", () => {
  const clientSource = readFileSync(
    resolve(process.cwd(), "src/features/reserve/api/issueNumbersClient.ts"),
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

describe("issueNumbers — request shape", () => {
  it("binds Reservation via @odata.type + pk and resolves on success", async () => {
    executeMock.mockResolvedValue({ success: true, data: {} });

    await issueNumbers({
      reservationId: "res-123",
      count: 3,
      businessCode: "GG",
      assetCode: "CG",
      unitCode: "00",
      domainCode: "ECS",
      systemCode: "AST",
      kindCode: "DD",
    });

    const arg = executeMock.mock.calls[0][0];
    expect(arg.operationName).toBe("enmax_acdnIssueNumbers");
    expect(arg.tableName).toBe("enmax_acdnissuenumbers");
    expect(arg.body).toMatchObject({
      Business: "GG",
      Asset: "CG",
      Unit: "00",
      Domain: "ECS",
      System: "AST",
      Kind: "DD",
      Count: 3,
      Reservation: {
        "@odata.type": "Microsoft.Dynamics.CRM.enmax_autocadreservation",
        enmax_autocadreservationid: "res-123",
      },
    });
  });

  it("throws with the server message on failure", async () => {
    executeMock.mockResolvedValue({ success: false, error: { message: "No numbers available." } });
    await expect(issueNumbers({
      reservationId: "res-123",
      count: 1,
      businessCode: "GG",
      assetCode: "CG",
      unitCode: "00",
      domainCode: "ECS",
      systemCode: "AST",
      kindCode: "DD",
    })).rejects.toThrow("No numbers available.");
  });

  it("falls back to a generic message when the server omits one", async () => {
    executeMock.mockResolvedValue({ success: false, error: undefined });
    await expect(issueNumbers({
      reservationId: "res-123",
      count: 1,
      businessCode: "GG",
      assetCode: "CG",
      unitCode: "00",
      domainCode: "ECS",
      systemCode: "AST",
      kindCode: "DD",
    })).rejects.toThrow("Number issuance failed");
  });
});
