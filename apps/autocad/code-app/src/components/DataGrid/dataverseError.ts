// Fail-loud (Rule 12): the grid only renders a generic error banner, so log the
// real Dataverse error (message/code are non-enumerable, hence the replacer) before
// throwing. Gives a debuggable cause for 4xx filter errors, privilege denials, throttling.
export function logDataverseError(area: string, error: unknown, context?: string): void {
  console.error(
    `[${area}] Dataverse request failed.`,
    context ? `(${context})` : "",
    "error:",
    error ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : "(none)",
  );
}
