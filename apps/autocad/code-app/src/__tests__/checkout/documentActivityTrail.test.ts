import { describe, expect, test } from "vitest";
import { ensureIssuanceActivity } from "../../features/checkout/hooks/useDocumentActivityTrail";
import type { AuditEvent } from "../../features/checkout/hooks/useDrawingAuditTrail";
import { lifecycleStepLabel } from "../../features/checkout/hooks/auditSentence";

function ev(partial: Partial<AuditEvent>): AuditEvent {
  return {
    id: "1",
    event: 2,
    createdOn: "2026-07-01T00:00:00Z",
    eventLabel: "State Changed",
    actedBy: "Alex",
    reason: "",
    fromState: "Available",
    toState: "CheckedOut",
    ...partial,
  };
}

describe("ensureIssuanceActivity", () => {
  test("synthesizes Allocated when Procedure has no issuance audit (import / missing AutoCreate row)", () => {
    const out = ensureIssuanceActivity([], {
      drawingId: "draw-1",
      createdOn: "2026-06-15T12:00:00Z",
      actedBy: "Approver One",
    });
    expect(out).toHaveLength(1);
    expect(lifecycleStepLabel(out[0]!)).toBe("Allocated");
    expect(out[0]!.actedBy).toBe("Approver One");
    expect(out[0]!.createdOn).toBe("2026-06-15T12:00:00Z");
  });

  test("does not duplicate when Allocated already exists", () => {
    const existing = [ev({
      id: "a1",
      event: 1,
      eventLabel: "Created",
      toState: "Allocated",
      fromState: "",
      actedBy: "Approver One",
    })];
    const out = ensureIssuanceActivity(existing, {
      drawingId: "draw-1",
      createdOn: "2026-06-15T12:00:00Z",
      actedBy: "Someone",
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("a1");
  });
});
