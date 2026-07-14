using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Approves a Pending SharePoint Import stub (Approver/Admin only).
    /// Custom API: enmax_acdnApproveSharePointImport (bound to enmax_autocaddrawing)
    ///
    /// Moves a drawing/document from Pending SharePoint Import (8) to Available (1) once an
    /// admin/approver has reviewed the imported metadata, stamping the approval timestamp.
    /// Rejects if another non-pending drawing already holds the same number — imports are
    /// best-effort and can collide with a number already issued through the reservation flow.
    /// </summary>
    public class ApproveSharePointImportPlugin : PluginBase
    {
        private const string DrawingEntity          = "enmax_autocaddrawing";
        private const string ColDrawingState        = "enmax_acdnstate";
        private const string ColDrawingNumber       = "enmax_acdnnumber";
        private const string ColSpImportApprovedOn  = "enmax_acdnspimportapprovedon";
        private const string DrawingIdField         = "enmax_autocaddrawingid";

        private const int StatePendingSharePointImport = 8;
        private const int StateAvailable               = 1;

        public ApproveSharePointImportPlugin() : base(typeof(ApproveSharePointImportPlugin)) { }

        public ApproveSharePointImportPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ApproveSharePointImportPlugin)) { }

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

            Authorization.RequireApproverOrAdmin(service, actorId, "approve a SharePoint import");

            var drawing = service.Retrieve(DrawingEntity, target.Id, new ColumnSet(ColDrawingState, ColDrawingNumber));
            int currentState = drawing.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0;
            if (currentState != StatePendingSharePointImport)
                throw new InvalidPluginExecutionException(
                    $"Drawing {target.Id} is in state {currentState}; only a Pending SharePoint Import " +
                    $"({StatePendingSharePointImport}) drawing can be approved.");

            string number = drawing.GetAttributeValue<string>(ColDrawingNumber);
            if (string.IsNullOrWhiteSpace(number))
                throw new InvalidPluginExecutionException($"Drawing {target.Id} has no number and cannot be approved.");

            var conflictQuery = new QueryExpression(DrawingEntity) { ColumnSet = new ColumnSet(false), TopCount = 1 };
            conflictQuery.Criteria.AddCondition(ColDrawingNumber, ConditionOperator.Equal, number);
            conflictQuery.Criteria.AddCondition(DrawingIdField, ConditionOperator.NotEqual, target.Id);
            conflictQuery.Criteria.AddCondition(ColDrawingState, ConditionOperator.NotEqual, StatePendingSharePointImport);
            if (service.RetrieveMultiple(conflictQuery).Entities.Count > 0)
                throw new InvalidPluginExecutionException(
                    $"Number {number} is already in use by another drawing; cannot approve this SharePoint import.");

            try
            {
                service.Execute(new UpdateRequest
                {
                    Target = new Entity(DrawingEntity, target.Id)
                    {
                        RowVersion             = drawing.RowVersion,
                        [ColDrawingState]       = new OptionSetValue(StateAvailable),
                        [ColSpImportApprovedOn] = DateTime.UtcNow,
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

            context.OutputParameters["DrawingId"] = target.Id.ToString();
            context.OutputParameters["NewState"]  = StateAvailable;
        }
    }
}
