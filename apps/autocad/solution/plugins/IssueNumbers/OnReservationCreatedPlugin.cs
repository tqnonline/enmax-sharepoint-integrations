using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Standard step plug-in: fires PostOperation on Create of enmax_autocadreservation.
    /// Registration: Message=Create, Entity=enmax_autocadreservation, Stage=40 (PostOperation), Mode=Synchronous.
    /// Writes the "submitted" audit event and notifies approvers/admins that a reservation needs approval.
    /// </summary>
    public class OnReservationCreatedPlugin : PluginBase
    {
        private const string EntityName = "enmax_autocadreservation";
        private const string ColNumber  = "enmax_acdnreservationid";

        private const string AuditEntityName    = "enmax_autocadauditevent";
        private const int    AuditEventCreated  = 1;
        private const int    AuditSourceAction  = 4;

        private const int NotifSeverityInfo             = 1;
        private const int NotifSeverityWarning          = 2;
        private const int NotifSourceReservationPending = 9;

        public OnReservationCreatedPlugin() : base(typeof(OnReservationCreatedPlugin)) { }

        public OnReservationCreatedPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(OnReservationCreatedPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;
            var actorId = localPluginContext.ActingUserId;

            if (!string.Equals(context.MessageName, "Create", StringComparison.OrdinalIgnoreCase))
                return;

            var reservationId = context.PrimaryEntityId;
            if (reservationId == Guid.Empty)
                return;

            localPluginContext.Trace($"Creating audit event for new reservation {reservationId}");

            var auditEvent = new Entity(AuditEntityName)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventCreated),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = reservationId.ToString(),
                ["enmax_acdnsubjecttable"] = EntityName,
                ["enmax_acdntostate"]      = "Pending",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", actorId),
                ["enmax_acdnname"]         = $"Reservation {reservationId} submitted",
            };
            service.Create(auditEvent);

            // Notifications are a side effect of the reservation being created, not the core
            // work itself — a notification failure (e.g. bad team config) must never roll back
            // the reservation create that already succeeded. Soft-fail: log and continue.
            try
            {
                string number = ResolveNumber(service, reservationId);
                string actor  = NotificationWriter.ResolveActorName(service, actorId);
                NotificationWriter.NotifyApproversAndAdmins(service, actorId,
                    title:        $"New reservation pending: {number}",
                    body:         $"{actor} submitted reservation {number} for approval.",
                    severity:     NotifSeverityWarning,
                    sourceEvent:  NotifSourceReservationPending,
                    subjectTable: EntityName,
                    subjectId:    reservationId.ToString(),
                    deepLinkPath: "/approvals");

                // Confirm submission to the requester (they are excluded from the approver fan-out).
                NotificationWriter.Create(service, actorId,
                    title:        $"Reservation submitted: {number}",
                    body:         $"Your reservation {number} was submitted and is pending approval.",
                    severity:     NotifSeverityInfo,
                    sourceEvent:  NotifSourceReservationPending,
                    subjectTable: EntityName,
                    subjectId:    reservationId.ToString(),
                    deepLinkPath: $"/reservations/{reservationId}");

                localPluginContext.Trace($"Audit + approver notifications written for reservation {reservationId}.");
            }
            catch (Exception ex)
            {
                localPluginContext.Trace($"OnReservationCreated: notification side effect failed — {ex.Message}");
                ExceptionEmitter.Log(
                    service,
                    localPluginContext.TracingService,
                    ex,
                    failedAction: $"{nameof(OnReservationCreatedPlugin)}.{nameof(ExecuteDataversePlugin)}",
                    subjectTable: EntityName,
                    subjectId: reservationId,
                    actingUserId: actorId,
                    correlationId: context.CorrelationId);
            }
        }

        private static string ResolveNumber(IOrganizationService service, Guid reservationId)
        {
            try
            {
                var r = service.Retrieve(EntityName, reservationId, new ColumnSet(ColNumber));
                var n = r.GetAttributeValue<string>(ColNumber);
                if (!string.IsNullOrWhiteSpace(n)) return n;
            }
            catch { /* number is cosmetic — fall back to the id */ }
            return reservationId.ToString();
        }
    }
}
