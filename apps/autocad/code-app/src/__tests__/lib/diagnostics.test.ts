import { isDiagnosticsOn, setDiagnostics, redact, diagLog } from "../../lib/diagnostics";

beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

test("toggle reflects in sessionStorage", () => {
  expect(isDiagnosticsOn()).toBe(false);
  setDiagnostics(true);
  expect(isDiagnosticsOn()).toBe(true);
  setDiagnostics(false);
  expect(isDiagnosticsOn()).toBe(false);
});

// The secret/PII boundary: secrets, PII, and App Config values are masked;
// non-sensitive fields (codes, filters) are preserved.
test("redact masks secrets/PII/app-config values, preserves the rest", () => {
  const out = redact({
    enmax_acdncode: "GG",
    enmax_acdndisplayname: "Generation",
    enmax_acdnvalue: "mailbox@enmax.com",       // app config value
    accessToken: "abc123",
    email: "a@b.com",
    fullName: "Jane Doe",
    filter: "_ownerid_value eq 'a-guid'",
    nested: { clientSecret: "xyz", code: "ok" },
  }) as Record<string, unknown>;

  expect(out.enmax_acdncode).toBe("GG");
  expect(out.enmax_acdndisplayname).toBe("Generation");   // "name" but not PII
  expect(out.enmax_acdnvalue).toBe("***");
  expect(out.accessToken).toBe("***");
  expect(out.email).toBe("***");
  expect(out.fullName).toBe("***");
  expect(out.filter).toContain("_ownerid_value");
  expect((out.nested as Record<string, unknown>).clientSecret).toBe("***");
  expect((out.nested as Record<string, unknown>).code).toBe("ok");
});

test("redact truncates oversized strings and arrays", () => {
  const long = "x".repeat(600);
  expect(redact(long)).toContain("(truncated)");
  const arr = Array.from({ length: 60 }, (_, i) => i);
  const out = redact(arr) as unknown[];
  expect(out).toHaveLength(51); // 50 items + elision marker
  expect(String(out[50])).toContain("+10 more");
});

test("redact handles circular references", () => {
  const a: Record<string, unknown> = { name: "x" };
  a.self = a;
  expect(() => redact(a)).not.toThrow();
});

test("diagLog is a no-op when off and logs when on", () => {
  const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "groupEnd").mockImplementation(() => {});

  diagLog("read", "drawings", { a: 1 });
  expect(group).not.toHaveBeenCalled();

  setDiagnostics(true);
  diagLog("read", "drawings", { a: 1 });
  expect(group).toHaveBeenCalledTimes(1);
});
