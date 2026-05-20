using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for declining a reservation.
    /// Custom API: enmax_acdnDeclineReservation (bound to enmax_autocadreservation)
    /// </summary>
    public class DeclineReservationPlugin : PluginBase
    {
        private const string EntityName    = "enmax_autocadreservation";
        private const string ColStatus     = "enmax_acdnstatus";
        private const string ColDeclineReason = "enmax_acdndeclinereason";

        private const int StatusPending  = 1;
        private const int StatusDeclined = 3;

        private const string AuditEntityName       = "enmax_autocadauditevent";
        private const int    AuditEventApprovalDenied = 4;
        private const int    AuditSourceAction        = 4;

        public DeclineReservationPlugin() : base(typeof(DeclineReservationPlugin)) { }

        public DeclineReservationPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(DeclineReservationPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.InitiatingUserService;

            if (!context.InputParameters.Contains("Target"))
                throw new InvalidPluginExecutionException("Missing required input: Target");

            var target = context.InputParameters["Target"] as EntityReference;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");

            if (!string.Equals(target.LogicalName, EntityName, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException(
                    $"Target must be {EntityName}, got {target.LogicalName}");

            string reason = context.InputParameters.Contains("Reason")
                ? (context.InputParameters["Reason"] as string ?? "")
                : "";

            localPluginContext.Trace($"Declining reservation {target.Id}");

            Entity reservation;
            try
            {
                reservation = service.Retrieve(EntityName, target.Id, new ColumnSet(ColStatus));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException(
                    $"Could not retrieve reservation {target.Id}: {ex.Message}", ex);
            }

            int currentStatus = reservation.GetAttributeValue<OptionSetValue>(ColStatus)?.Value ?? 0;

            if (currentStatus == StatusDeclined)
            {
                localPluginContext.Trace($"Reservation {target.Id} already declined; no-op.");
                return;
            }

            if (currentStatus != StatusPending)
                throw new InvalidPluginExecutionException(
                    $"Reservation {target.Id} cannot be declined from status {currentStatus}.");

            var update = new Entity(EntityName, target.Id)
            {
                [ColStatus]        = new OptionSetValue(StatusDeclined),
                [ColDeclineReason] = reason,
            };
            service.Update(update);

            localPluginContext.Trace($"Reservation {target.Id} declined.");

            var auditEvent = new Entity(AuditEntityName)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventApprovalDenied),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = EntityName,
                ["enmax_acdnfromstate"]    = "Pending",
                ["enmax_acdntostate"]      = "Declined",
                ["enmax_acdnreason"]       = reason,
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Approval denied for reservation {target.Id}",
            };
            service.Create(auditEvent);

            localPluginContext.Trace($"Audit event created for reservation {target.Id}.");
        }
    }
}
