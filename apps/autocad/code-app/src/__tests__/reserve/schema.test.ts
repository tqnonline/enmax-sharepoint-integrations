import { reserveSchema } from "../../features/reserve/schema";

const VALID_BASE = {
  recordType: "Drawing" as const,
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
  override: false,
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

// Test 6 — Override reason required when override=true
test("requires overrideReason when override=true — form-level validation error", () => {
  const result = reserveSchema.safeParse({ ...VALID_BASE, override: true, overrideReason: "" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const overridePaths = result.error.issues.map((e) => e.path[0]);
    expect(overridePaths).toContain("overrideReason");
  }
});

test("accepts valid form data with override and justification", () => {
  const result = reserveSchema.safeParse({
    ...VALID_BASE,
    override: true,
    overrideReason: "This is a valid justification text",
  });
  expect(result.success).toBe(true);
});

test("accepts valid form data without override", () => {
  const result = reserveSchema.safeParse(VALID_BASE);
  expect(result.success).toBe(true);
});
