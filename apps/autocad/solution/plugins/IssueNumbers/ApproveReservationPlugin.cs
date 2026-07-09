using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for atomically approving a reservation.
    /// Custom API: enmax_acdnApproveReservation (bound to enmax_autocadreservation)
    /// </summary>
    public class ApproveReservationPlugin : PluginBase
    {
        // -----------------------------------------------------------------------
        // Constants
        // -----------------------------------------------------------------------

        private const string EntityName    = "enmax_autocadreservation";
        private const string ColStatus     = "enmax_acdnstatus";
        private const string ColApprovedOn = "enmax_acdnapprovedon";
        private const string ColApprover   = "enmax_acdnapprover";
        private const string ColOwner      = "ownerid";
        private const string ColNumber     = "enmax_acdnreservationid";

        private const int NotifSeverityInfo              = 1;
        private const int NotifSourceReservationApproved = 1;

        private const string AuditEntityName = "enmax_autocadauditevent";
        private const int    AuditEventApprovalGranted = 3;
        private const int    AuditSourceAction         = 4;

        private const int StatusPending  = 1;
        private const int StatusApproved = 2;

        // -----------------------------------------------------------------------
        // Constructors
        // -----------------------------------------------------------------------

        public ApproveReservationPlugin() : base(typeof(ApproveReservationPlugin)) { }

        public ApproveReservationPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ApproveReservationPlugin)) { }

        // -----------------------------------------------------------------------
        // Core logic
        // -----------------------------------------------------------------------

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;
            var actorId = PluginActor.ResolveForCustomApi(context, service);

            // Bound Custom API — Target is an EntityReference to the reservation row
            if (!context.InputParameters.Contains("Target"))
                throw new InvalidPluginExecutionException("Missing required input: Target");

            var target = context.InputParameters["Target"] as EntityReference;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");

            if (!string.Equals(target.LogicalName, EntityName, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException(
                    $"Target must be {EntityName}, got {target.LogicalName}");

            Authorization.RequireApproverOrAdmin(service, actorId, "approve a reservation");

            localPluginContext.Trace($"Approving reservation {target.Id} for user {actorId}");

            // Retrieve current status — needed to guard against double-approvals
            Entity reservation;
            try
            {
                reservation = service.Retrieve(EntityName, target.Id, new ColumnSet(ColStatus, ColOwner, ColNumber));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException(
                    $"Could not retrieve reservation {target.Id}: {ex.Message}", ex);
            }

            int currentStatus = reservation.GetAttributeValue<OptionSetValue>(ColStatus)?.Value ?? 0;

            // Idempotent — already approved is a no-op
            if (currentStatus == StatusApproved)
            {
                localPluginContext.Trace($"Reservation {target.Id} already approved; no-op.");
                return;
            }

            if (currentStatus != StatusPending)
                throw new InvalidPluginExecutionException(
                    $"Reservation {target.Id} cannot be approved from status {currentStatus}. " +
                    $"Expected {StatusPending} (Pending).");

            var update = new Entity(EntityName, target.Id)
            {
                [ColStatus]     = new OptionSetValue(StatusApproved),
                [ColApprovedOn] = DateTime.UtcNow,
                [ColApprover]   = new EntityReference("systemuser", actorId),
            };

            service.Update(update);

            localPluginContext.Trace($"Reservation {target.Id} approved.");

            var auditEvent = new Entity(AuditEntityName)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventApprovalGranted),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = EntityName,
                ["enmax_acdnfromstate"]    = "Pending",
                ["enmax_acdntostate"]      = "Approved",
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", actorId),
                ["enmax_acdnname"]         = $"Approval granted for reservation {target.Id}",
            };
            service.Create(auditEvent);

            // Notify the requester their reservation was approved (including when they self-approve in small teams).
            var owner = reservation.GetAttributeValue<EntityReference>(ColOwner);
            if (owner != null)
            {
                string number = reservation.GetAttributeValue<string>(ColNumber);
                if (string.IsNullOrWhiteSpace(number)) number = target.Id.ToString();
                NotificationWriter.Create(service, owner.Id,
                    title:        $"Reservation approved: {number}",
                    body:         $"Your reservation {number} was approved and the drawing numbers have been issued.",
                    severity:     NotifSeverityInfo,
                    sourceEvent:  NotifSourceReservationApproved,
                    subjectTable: EntityName,
                    subjectId:    target.Id.ToString(),
                    deepLinkPath: $"/reservations/{target.Id}");
            }

            localPluginContext.Trace($"Audit event created for reservation {target.Id}.");
        }
    }
}
