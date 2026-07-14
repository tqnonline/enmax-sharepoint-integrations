export const EXCEPTION_ORIGIN = {
  Flow: 1,
  CodeApp: 2,
  // Emitted by Dataverse plug-ins (ExceptionEmitter.cs); the Code App never emits this itself.
  Plugin: 3,
} as const;

export const EXCEPTION_SEVERITY = {
  Warning: 1,
  Error: 2,
  Critical: 3,
} as const;

export type ExceptionSeverity = (typeof EXCEPTION_SEVERITY)[keyof typeof EXCEPTION_SEVERITY];

export interface LogExceptionInput {
  area: string;
  error: unknown;
  context?: string;
  subjectTable?: string;
  subjectId?: string;
  severity?: ExceptionSeverity;
  route?: string;
}

const CORRELATION_STORAGE_KEY = "enmax_acdn_correlation_id";

const SECRET_KEY_PATTERN = /(token|secret|password|authorization|bearer|api[_-]?key)/i;

export function getOrCreateCorrelationId(): string {
  try {
    const existing = sessionStorage.getItem(CORRELATION_STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(CORRELATION_STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
  }
  if (error && typeof error === "object") {
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
  }
  return JSON.stringify(error ?? null);
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSecrets(child);
    }
    return out;
  }
  if (typeof value === "string" && /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value)) {
    return "[REDACTED_JWT]";
  }
  return value;
}

function buildErrorDetail(error: unknown, context?: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializeError(error));
  } catch {
    parsed = { message: String(error) };
  }
  const payload = redactSecrets({
    context: context ?? null,
    error: parsed,
  });
  return JSON.stringify(payload);
}

function buildErrorMessage(error: unknown, area: string): string {
  if (error instanceof Error && error.message) {
    return `[${area}] ${error.message}`;
  }
  return `[${area}] Dataverse request failed`;
}

function currentRoute(route?: string): string {
  if (route) return route;
  try {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  } catch {
    return "";
  }
}

let persistFn: ((record: Record<string, unknown>) => Promise<unknown>) | null = null;

/** Test hook to inject/mock persistence without Dataverse. */
export function setExceptionPersistFn(
  fn: ((record: Record<string, unknown>) => Promise<unknown>) | null,
): void {
  persistFn = fn;
}

async function persistException(record: Record<string, unknown>): Promise<void> {
  if (persistFn) {
    await persistFn(record);
    return;
  }
  const { Enmax_autocadflowexceptionsService } = await import("../generated/services/Enmax_autocadflowexceptionsService");
  await Enmax_autocadflowexceptionsService.create(
    record as Parameters<typeof Enmax_autocadflowexceptionsService.create>[0],
  );
}

export async function logException(input: LogExceptionInput): Promise<void> {
  const {
    area,
    error,
    context,
    subjectTable,
    subjectId,
    severity = EXCEPTION_SEVERITY.Error,
    route,
  } = input;

  console.error(
    `[${area}] Dataverse request failed.`,
    context ? `(${context})` : "",
    "error:",
    error ? serializeError(error) : "(none)",
  );

  const correlationId = getOrCreateCorrelationId();
  const appRoute = currentRoute(route);
  const failedAction = context ? `${area} (${context})` : area;
  const title = `Code App | ${area} | ${failedAction} | ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

  const record: Record<string, unknown> = {
    enmax_acdnname: title,
    enmax_acdnorigin: EXCEPTION_ORIGIN.CodeApp,
    enmax_acdnseverity: severity,
    enmax_acdnerrormessage: buildErrorMessage(error, area),
    enmax_acdnerrordetail: buildErrorDetail(error, context),
    enmax_acdnfailedaction: failedAction,
    enmax_acdnapparea: area,
    enmax_acdnapproute: appRoute,
    enmax_acdncorrelationid: correlationId,
  };

  if (subjectTable) record.enmax_acdnsubjecttable = subjectTable;
  if (subjectId) record.enmax_acdnsubjectid = subjectId;

  if (!persistFn) {
    try {
      const who = await import("../generated/services/WhoAmIService");
      const me = await who.WhoAmIService.WhoAmI();
      const userId = me.data?.UserId;
      if (typeof userId === "string" && userId) {
        record["enmax_acdnactinguser@odata.bind"] = `/systemusers(${userId})`;
      }
    } catch {
      // Acting user is optional; never block UI on WhoAmI failure.
    }
  }

  try {
    await persistException(record);
  } catch (persistError) {
    console.warn("[exceptionLogger] Failed to persist exception row.", persistError);
  }
}
