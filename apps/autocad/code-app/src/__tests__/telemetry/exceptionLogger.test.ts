import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOrCreateCorrelationId,
  logException,
  redactSecrets,
  setExceptionPersistFn,
} from "../../telemetry/exceptionLogger";

describe("exceptionLogger", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setExceptionPersistFn(null);
    vi.restoreAllMocks();
  });

  it("keeps correlation id stable for the tab session", () => {
    const first = getOrCreateCorrelationId();
    const second = getOrCreateCorrelationId();
    expect(second).toBe(first);
  });

  it("redacts secret-like keys and jwt strings", () => {
    const redacted = redactSecrets({
      access_token: "eyJabc.def.ghi",
      nested: { authorization: "Bearer secret" },
      ok: "visible",
    }) as Record<string, unknown>;
    expect(redacted.access_token).toBe("[REDACTED]");
    expect((redacted.nested as Record<string, unknown>).authorization).toBe("[REDACTED]");
    expect(redacted.ok).toBe("visible");
  });

  it("swallows persistence failures without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setExceptionPersistFn(async () => {
      throw new Error("403 Forbidden");
    });

    await expect(
      logException({ area: "MyRecords/Drawings", error: new Error("boom") }),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("persists CodeApp-origin rows via injected persist fn", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const persist = vi.fn(async () => ({ data: { enmax_autocadflowexceptionid: "1" } }));
    setExceptionPersistFn(persist);

    await logException({
      area: "MyRecords/Drawings",
      error: new Error("filter failed"),
      context: "filter x",
      subjectTable: "enmax_autocaddrawing",
      subjectId: "abc",
    });

    expect(persist).toHaveBeenCalledTimes(1);
    const record = persist.mock.calls[0][0] as Record<string, unknown>;
    expect(record.enmax_acdnorigin).toBe(2);
    expect(record.enmax_acdnapparea).toBe("MyRecords/Drawings");
    expect(record.enmax_acdnsubjecttable).toBe("enmax_autocaddrawing");
    expect(record.enmax_acdnsubjectid).toBe("abc");
    expect(String(record.enmax_acdnerrordetail)).not.toContain("Bearer");
  });
});
