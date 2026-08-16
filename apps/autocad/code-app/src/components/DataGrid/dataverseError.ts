// Fail-loud (Rule 12): the grid only renders a generic error banner, so log the
// real Dataverse error (message/code are non-enumerable, hence the replacer) before
// throwing. Gives a debuggable cause for 4xx filter errors, privilege denials, throttling.
import { logException, type ExceptionSeverity } from "../../telemetry/exceptionLogger";

export interface LogDataverseErrorOptions {
  context?: string;
  subjectTable?: string;
  subjectId?: string;
  severity?: ExceptionSeverity;
  route?: string;
}

export function logDataverseError(
  area: string,
  error: unknown,
  context?: string,
  options?: Omit<LogDataverseErrorOptions, "context">,
): void {
  void logException({
    area,
    error,
    context,
    subjectTable: options?.subjectTable,
    subjectId: options?.subjectId,
    severity: options?.severity,
    route: options?.route,
  });
}
