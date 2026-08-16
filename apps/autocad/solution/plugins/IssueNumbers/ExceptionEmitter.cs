using Microsoft.Xrm.Sdk;
using System;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Writes an enmax_autocadflowexception row for plug-in failures (ADR 0004, origin = Plugin).
    /// Mirrors <see cref="AuditEmitter"/> in shape but targets the exception table instead of the
    /// audit-event table, and is called directly from a catch block rather than registered as a
    /// step of its own.
    ///
    /// Soft-fail by design: <see cref="Log"/> never throws. A failure to log an exception must not
    /// mask, replace, or roll back the original exception/transaction.
    /// </summary>
    public static class ExceptionEmitter
    {
        private const string ExceptionEntity = "enmax_autocadflowexception";

        // Option-set value matching enmax_acdn_exceptionorigin.
        public const int OriginPlugin = 3;

        // Option-set values matching enmax_acdn_exceptionseverity.
        public const int SeverityWarning  = 1;
        public const int SeverityError    = 2;
        public const int SeverityCritical = 3;

        private const int NameMaxLength         = 300;
        private const int ErrorCodeMaxLength    = 100;
        private const int FailedActionMaxLength = 200;

        /// <summary>
        /// Creates an enmax_autocadflowexception row describing a plug-in failure. Swallows any
        /// exception raised while logging (including a failed Create) so the caller's original
        /// exception path is never disturbed.
        /// </summary>
        public static void Log(
            IOrganizationService service,
            ITracingService tracing,
            Exception ex,
            string failedAction,
            string subjectTable = null,
            Guid? subjectId = null,
            Guid? actingUserId = null,
            Guid? correlationId = null,
            int severity = SeverityError)
        {
            try
            {
                if (service == null || ex == null) return;

                var title = Truncate($"Plugin | {failedAction} | {DateTime.UtcNow:yyyy-MM-dd HH:mm}", NameMaxLength);

                var row = new Entity(ExceptionEntity)
                {
                    ["enmax_acdnname"]         = title,
                    ["enmax_acdnorigin"]       = new OptionSetValue(OriginPlugin),
                    ["enmax_acdnseverity"]     = new OptionSetValue(severity),
                    ["enmax_acdnerrormessage"] = ex.Message,
                    ["enmax_acdnerrorcode"]    = Truncate(ex.GetType().Name, ErrorCodeMaxLength),
                    ["enmax_acdnerrordetail"]  = ex.ToString(),
                    ["enmax_acdnfailedaction"] = Truncate(failedAction, FailedActionMaxLength),
                };

                if (!string.IsNullOrWhiteSpace(subjectTable)) row["enmax_acdnsubjecttable"] = subjectTable;
                if (subjectId.HasValue)                       row["enmax_acdnsubjectid"]    = subjectId.Value.ToString();
                if (correlationId.HasValue)                   row["enmax_acdncorrelationid"] = correlationId.Value.ToString();
                if (actingUserId.HasValue && actingUserId.Value != Guid.Empty)
                    row["enmax_acdnactinguser"] = new EntityReference("systemuser", actingUserId.Value);

                service.Create(row);
                tracing?.Trace($"ExceptionEmitter: logged plug-in exception for '{failedAction}'.");
            }
            catch (Exception logEx)
            {
                // Never let exception logging itself fail the caller's transaction.
                tracing?.Trace($"ExceptionEmitter: failed to log exception — {logEx.Message}");
            }
        }

        private static string Truncate(string value, int maxLength)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= maxLength) return value;
            return value.Substring(0, maxLength);
        }
    }
}
