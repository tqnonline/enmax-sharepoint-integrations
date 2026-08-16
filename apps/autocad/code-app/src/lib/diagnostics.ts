import { useSyncExternalStore } from "react";

// Diagnostics Mode: session-scoped (clears when the tab closes). When on, the
// global QueryClient cache handlers log every data fetch / mutation + errors to
// the browser console for troubleshooting. Payloads are passed through redact()
// so secrets / App Config values / obvious PII don't reach the console.
const KEY = "enmax.diagnostics";

const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

export function isDiagnosticsOn(): boolean {
  try { return sessionStorage.getItem(KEY) === "on"; } catch { return false; }
}

export function setDiagnostics(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(KEY, "on");
    else sessionStorage.removeItem(KEY);
  } catch { /* sessionStorage unavailable — ignore */ }
  emit();
}

// Support can hand a user a `?debug=1` link to enable it remotely (works with the
// hash router: the param sits before the # in location.search).
export function applyDebugQueryParam(): void {
  try {
    if (new URLSearchParams(window.location.search).get("debug") === "1") setDiagnostics(true);
  } catch { /* ignore */ }
}

export function useDiagnostics(): { on: boolean; setOn: (on: boolean) => void } {
  const on = useSyncExternalStore(subscribe, isDiagnosticsOn, () => false);
  return { on, setOn: setDiagnostics };
}

// ---- redaction --------------------------------------------------------------

const SECRET_KEY = /(token|secret|password|authorization|bearer|api[-_]?key|client[-_]?secret)/i;
const PII_KEY = /(email|upn|userprincipalname|fullname)/i;
const APP_CONFIG_VALUE = "enmax_acdnvalue"; // App Config value column (mailbox, SP URL, team ids)
const MAX_STR = 500;
const MAX_ARR = 50;

/**
 * Best-effort masking before logging. A denylist cannot guarantee zero PII — this
 * is the accepted trade for "metadata + redacted payloads". Auth tokens never reach
 * here (the Power Apps host owns them), so they can't leak through logs.
 */
export function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === "string") return value.length > MAX_STR ? `${value.slice(0, MAX_STR)}…(truncated)` : value;
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ARR).map(v => redact(v, seen));
    if (value.length > MAX_ARR) out.push(`…(+${value.length - MAX_ARR} more)`);
    return out;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === APP_CONFIG_VALUE || SECRET_KEY.test(k) || PII_KEY.test(k)) out[k] = "***";
    else out[k] = redact(v, seen);
  }
  return out;
}

// ---- logger -----------------------------------------------------------------

export function diagLog(category: string, summary: string, details?: unknown): void {
  if (!isDiagnosticsOn()) return;
  console.groupCollapsed(
    `%c[diag]%c ${category} — ${summary}`,
    "color:#E1393E;font-weight:bold",
    "color:inherit",
  );
  if (details !== undefined) console.debug(redact(details));
  console.groupEnd();
}
