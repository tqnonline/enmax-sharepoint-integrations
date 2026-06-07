using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Admin: mark a drawing Obsolete ("do not use"). Terminal.
    /// Custom API: enmax_acdnMarkObsolete (bound to enmax_autocaddrawing)
    /// Guard: drawing non-terminal (not 5/6/7). Reason optional.
    /// </summary>
    public class MarkObsoletePlugin : PluginBase
    {
        private const string DrawingEntity      = "enmax_autocaddrawing";
        private const string ColDrawingState    = "enmax_acdnstate";
        private const string ColCurrentRevision = "enmax_acdncurrentrevision";
        private const string SheetEntity     = "enmax_autocadsheet";
        private const string ColSheetDrawing = "enmax_acdndrawing";
        private const string ColSheetState   = "enmax_acdnstate";
        private const string AuditEntity            = "enmax_autocadauditevent";
        private const int    AuditEventStateChanged = 2;
        private const int    AuditSourceAction      = 4;
        private const int    StateObsolete      = 5;
        private const int    StateVoid          = 6;
        private const int    StateFinalized     = 7;
        private const int    SheetStateObsolete = 5;

        private const string ColOwner  = "ownerid";
        private const string ColNumber = "enmax_acdnnumber";
        private const int NotifSeverityWarning = 2;
        private const int NotifSourceSystem    = 8;

        public MarkObsoletePlugin() : base(typeof(MarkObsoletePlugin)) { }
        public MarkObsoletePlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(MarkObsoletePlugin)) { }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;

            var target = context.InputParameters.Contains("Target")
                ? context.InputParameters["Target"] as EntityReference : null;
            if (target == null)
                throw new InvalidPluginExecutionException("Missing required input: Target");
            if (!string.Equals(target.LogicalName, DrawingEntity, StringComparison.OrdinalIgnoreCase))
                throw new InvalidPluginExecutionException($"Target must be {DrawingEntity}, got {target.LogicalName}");

            string reason = context.InputParameters.Contains("Reason")
                ? context.InputParameters["Reason"] as string ?? string.Empty : string.Empty;

            Authorization.RequireAdmin(service, context.InitiatingUserId, "mark a drawing obsolete");

            var drawing = service.Retrieve(DrawingEntity, target.Id, new ColumnSet(ColDrawingState, ColCurrentRevision, ColOwner, ColNumber));
            int currentState = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
            if (currentState == StateObsolete || currentState == StateVoid || currentState == StateFinalized)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} is already terminal (state {currentState}); cannot mark obsolete.");

            // Business rule: a drawing can only be marked obsolete after at least one check-in.
            // currentRevision is written only on a successful check-in, so an empty value
            // means the drawing has never been checked in.
            string currentRevision = drawing.GetAttributeValue<string>(ColCurrentRevision);
            if (string.IsNullOrWhiteSpace(currentRevision))
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} cannot be marked obsolete: it has never been checked in (no current revision). At least one check-in is required.");

            try
            {
                service.Execute(new UpdateRequest
                {
                    Target = new Entity(DrawingEntity, target.Id)
                    {
                        RowVersion        = drawing.RowVersion,
                        [ColDrawingState] = new OptionSetValue(StateObsolete),
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
                service.Update(new Entity(SheetEntity, sheet.Id) { [ColSheetState] = new OptionSetValue(SheetStateObsolete) });

            service.Create(new Entity(AuditEntity)
            {
                ["enmax_acdnevent"]        = new OptionSetValue(AuditEventStateChanged),
                ["enmax_acdnsource"]       = new OptionSetValue(AuditSourceAction),
                ["enmax_acdnsubjectid"]    = target.Id.ToString(),
                ["enmax_acdnsubjecttable"] = DrawingEntity,
                ["enmax_acdntostate"]      = "Obsolete",
                ["enmax_acdnreason"]       = reason,
                ["enmax_acdnactedby"]      = new EntityReference("systemuser", context.InitiatingUserId),
                ["enmax_acdnname"]         = $"Drawing {target.Id} marked obsolete",
            });

            // Notify the drawing owner it was retired.
            var owner = drawing.GetAttributeValue<EntityReference>(ColOwner);
            if (owner != null && owner.Id != context.InitiatingUserId)
            {
                string number = drawing.GetAttributeValue<string>(ColNumber);
                if (string.IsNullOrWhiteSpace(number)) number = target.Id.ToString();
                NotificationWriter.Create(service, owner.Id,
                    title:        $"Drawing marked obsolete: {number}",
                    body:         string.IsNullOrWhiteSpace(reason)
                                    ? $"Your drawing {number} was marked obsolete — do not use it."
                                    : $"Your drawing {number} was marked obsolete — do not use it. Reason: {reason}",
                    severity:     NotifSeverityWarning,
                    sourceEvent:  NotifSourceSystem,
                    subjectTable: DrawingEntity,
                    subjectId:    target.Id.ToString(),
                    deepLinkPath: "/my-items");
            }
        }
    }
}
