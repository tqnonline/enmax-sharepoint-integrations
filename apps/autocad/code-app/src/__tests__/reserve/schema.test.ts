import { reserveSchema } from "../../features/reserve/schema";

const VALID_BASE = {
  reservationType: "Drawing" as const,
  business: "bus-id",
  asset:    "asset-id",
  unit:     "unit-id",
  domain:   "dom-id",
  system:   "sys-id",
  kind:     "kind-id",
  count:    3,
  sheetsPerDrawing: 5,
  sequenceType: "New" as const,
  reason: "test reservation reason text",
};

// Test 4 — Zod rejects count > MaxDrawingsPerReservation ceiling (hard cap at 10 per default config)
test("rejects count above schema maximum of 10", () => {
  const result = reserveSchema.safeParse({ ...VALID_BASE, count: 11 });
  expect(result.success).toBe(false);
  if (!result.success) {
    const msg = result.error.issues.map((e) => e.message).join(" ");
    expect(msg).toBeTruthy();
  }
});

// Test 5 — Zod rejects reason shorter than 10 characters
test("rejects reason shorter than 10 characters", () => {
  const result = reserveSchema.safeParse({ ...VALID_BASE, reason: "too short" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const paths = result.error.issues.map((e) => e.path[0]);
    expect(paths).toContain("reason");
  }
});

// Combination override removed (ADR 0001 #4): the six segments are independent,
// so there is no override/justification path in the schema anymore.

test("accepts a valid Drawing reservation", () => {
  const result = reserveSchema.safeParse(VALID_BASE);
  expect(result.success).toBe(true);
});

// Taxonomy (ADR 0001 #1): a Document must specify a subtype (Standard | Procedure).
test("accepts a Document/Standard reservation", () => {
  const result = reserveSchema.safeParse({
    ...VALID_BASE,
    reservationType: "Document",
    documentSubtype: "Standard",
  });
  expect(result.success).toBe(true);
});

test("accepts a Document/Procedure reservation", () => {
  const result = reserveSchema.safeParse({
    ...VALID_BASE,
    reservationType: "Document",
    documentSubtype: "Procedure",
  });
  expect(result.success).toBe(true);
});

test("rejects a Document reservation with no subtype", () => {
  const result = reserveSchema.safeParse({ ...VALID_BASE, reservationType: "Document" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const paths = result.error.issues.map((e) => e.path[0]);
    expect(paths).toContain("documentSubtype");
  }
});

test("rejects an unknown reservation type", () => {
  const result = reserveSchema.safeParse({ ...VALID_BASE, reservationType: "Widget" });
  expect(result.success).toBe(false);
});
