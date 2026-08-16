using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in to finalize a drawing (terminal state).
    /// Custom API: enmax_acdnFinalizeDrawing (bound to enmax_autocaddrawing)
    ///
    /// Guard: drawing must be Available(1). Drawing -> Finalized(7) with RowVersion concurrency;
    /// sheets -> Finalized(7); audit event=9 keyed to drawingId with the supplied reason.
    /// </summary>
    public class FinalizeDrawingPlugin : PluginBase
    {
        private const string DrawingEntity      = "enmax_autocaddrawing";
        private const string ColDrawingState    = "enmax_acdnstate";
        private const string ColCurrentRevision = "enmax_acdncurrentrevision";

        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColSheetDrawing = "enmax_acdndrawing";
        private const string ColSheetState   = "enmax_acdnstate";

        private const string AuditEntity        = "enmax_autocadauditevent";
        private const int    AuditEventFinalized = 9;
        private const int    AuditSourceAction   = 4;

        private const int StateAvailable  = 1;
        private const int StateFinalized  = 7;
        private const int SheetStateFinalized = 7;

        private const string ColOwner  = "ownerid";
        private const string ColNumber = "enmax_acdnnumber";
        private const int NotifSeverityInfo = 1;
        private const int NotifSourceSystem = 8;

        public FinalizeDrawingPlugin() : base(typeof(FinalizeDrawingPlugin)) { }
        public FinalizeDrawingPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(FinalizeDrawingPlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;
            var actorId = PluginActor.ResolveForCustomApi(context, service);

            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as EntityReference : null;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");
            if (!string.Equals(target.LogicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"Target must be {DrawingEntity}, got {target.LogicalName}");

            string reason = context.InputParameters.Contains("Reason")
                ? context.InputParameters["Reason"] as string ?? string.Empty : string.Empty;
            if (reason.Trim().Length < 10)
                throw new InvalidPluginExecutionException("Reason must be at least 10 characters to finalize a drawing.");

            Entity drawing;
            try
            {
                drawing = service.Retrieve(DrawingEntity, target.Id, new ColumnSet(ColDrawingState, ColCurrentRevision, ColOwner, ColNumber));
            }
            catch (FaultException<OrganizationServiceFault> ex)
            {
                throw new InvalidPluginExecutionException($"Could not retrieve drawing {target.Id}: {ex.Message}", ex);
            }

            Authorization.RequireOwnerOrAdmin(service,
                drawing.GetAttributeValue<EntityReference>(ColOwner)?.Id ?? Guid.Empty,
                actorId,
                "finalize this drawing");

            int currentState = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
            if (currentState != StateAvailable)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} cannot be finalized from state {currentState}. Expected {StateAvailable} (Available).");

            // Business rule: a drawing can only be finalized after at least one check-in.
            // currentRevision is written only on a successful check-in, so an empty value
            // means the drawing has never been checked in.
            string currentRevision = drawing.GetAttributeValue<string>(ColCurrentRevision);
            if (string.IsNullOrWhiteSpace(currentRevision))
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} cannot be finalized: it has never been checked in (no current revision). At least one check-in is required.");

            try
            {
                service.Execute(new UpdateRequest
                {
                    Target = new Entity(DrawingEntity, target.Id)
                    {
                        RowVersion        = drawing.RowVersion,
                        [ColDrawingState] = new OptionSetValue(StateFinalized),
                    },
                    ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
                });
            }
            catch (FaultException<OrganizationServiceFault> ex)
                when (ex.Detail?.ErrorCode == -2147088254 ||
                      (ex.Message != null && ex.Message.Contains("ConcurrencyVersionMismatch")))
            {
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} was concurrently modified (ConcurrencyVersionMismatch). Retry.", ex);
            }

            var sheetQuery = new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet("enmax_autocadsheetid") };
            sheetQuery.Criteria.AddCondition(ColSheetDrawing, ConditionOperator.Equal, target.Id);
            foreach (var sheet in service.RetrieveMultiple(sheetQuery).Entities)
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(SheetStateFinalized) });

            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventFinalized),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdnfromstate"]    = "Available",
                ["enmax_acdntostate"]      = "Finalized",
                ["enmax_acdnreason"]       = reason.Trim(),
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", actorId),
                ["enmax_acdnname"]         = $"Drawing {target.Id} finalized",
            });

            // Notify the drawing owner it was finalized.
            var owner = drawing.GetAttributeValue<EntityReference>(ColOwner);
            if (owner != null && owner.Id != actorId)
            {
                string number = drawing.GetAttributeValue<string>(ColNumber);
                if (string.IsNullOrWhiteSpace(number)) number = target.Id.ToString();
                NotificationWriter.Create(service, owner.Id,
                    title:        $"Drawing finalized: {number}",
                    body:         $"Your drawing {number} was finalized and is now locked.",
                    severity:     NotifSeverityInfo,
                    sourceEvent:  NotifSourceSystem,
                    subjectTable: DrawingEntity,
                    subjectId:    target.Id.ToString(),
                    deepLinkPath: "/my-items");
            }
        }
    }
}
