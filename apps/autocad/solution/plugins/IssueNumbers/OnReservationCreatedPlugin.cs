using Microsoft.Xrm.Sdk;
using System;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Standard step plug-in: fires PostOperation on Create of enmax_autocadreservation.
    /// Registration: Message=Create, Entity=enmax_autocadreservation, Stage=40 (PostOperation), Mode=Synchronous.
    /// </summary>
    public class OnReservationCreatedPlugin : PluginBase
    {
        private const string EntityName = "enmax_autocadreservation";

        private const string AuditEntityName    = "enmax_autocadauditevent";
        private const int    AuditEventCreated  = 1;
        private const int    AuditSourceAction  = 4;

        public OnReservationCreatedPlugin() : base(typeof(OnReservationCreatedPlugin)) { }

        public OnReservationCreatedPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(OnReservationCreatedPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.InitiatingUserService;

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
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Reservation {reservationId} submitted",
            };
            service.Create(auditEvent);

            localPluginContext.Trace($"Audit event created for reservation {reservationId}.");
        }
    }
}
