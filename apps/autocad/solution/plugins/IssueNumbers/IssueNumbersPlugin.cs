using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Dataverse plug-in for concurrency-safe drawing number issuance.
    /// Custom action: enmax_acdnIssueNumbers
    /// Plugin development guide: https://docs.microsoft.com/powerapps/developer/common-data-service/plug-ins
    /// </summary>
    public class IssueNumbersPlugin : PluginBase
    {
        // -----------------------------------------------------------------------
        // Constants
        // -----------------------------------------------------------------------

        private const int MaxNumber           = 9999;
        private const int MaxCount            = 1000;
        private const int WarningThreshold    = 9000;
        private const int CriticalThreshold   = 9900;
        private const int StatusHealthy       = 1;
        private const int StatusWarning       = 2;
        private const int StatusCritical      = 3;
        private const int StatusExhausted     = 4;
        private const string EntityName      = "enmax_autocadnumbersequence";
        private const string ColSequenceKey  = "enmax_acdnsequencekey";
        private const string ColLastIssued   = "enmax_acdnlastissued";
        private const string ColSeedValue    = "enmax_acdnseedvalue";
        private const string ColLastIssuedAt = "enmax_acdnlastissuedat";
        private const string ColStatus       = "enmax_acdnstatus";

        // -----------------------------------------------------------------------
        // Constructors
        // -----------------------------------------------------------------------

        public IssueNumbersPlugin() : base(typeof(IssueNumbersPlugin)) { }

        public IssueNumbersPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(IssueNumbersPlugin))
        {
        }

        // -----------------------------------------------------------------------
        // Core logic
        // -----------------------------------------------------------------------

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.SystemUserService;

            // Authorization gate — caller must be Approver or Admin.
            Authorization.RequireApproverOrAdmin(service, context.InitiatingUserId, "issue numbers");

            // Step 2 — Validate required string parameters (presence and non-empty)
            var requiredParams = new[] { "Business", "Asset", "Unit", "Domain", "System", "Kind" };
            foreach (var paramName in requiredParams)
            {
                if (!context.InputParameters.Contains(paramName))
                    throw new InvalidPluginExecutionException($"Missing required parameter: {paramName}");
                if (string.IsNullOrWhiteSpace((string)context.InputParameters[paramName]))
                    throw new InvalidPluginExecutionException($"Missing required parameter: {paramName}");
            }

            string business = (string)context.InputParameters["Business"];
            string asset    = (string)context.InputParameters["Asset"];
            string unit     = (string)context.InputParameters["Unit"];
            string domain   = (string)context.InputParameters["Domain"];
            string system   = (string)context.InputParameters["System"];
            string kind     = (string)context.InputParameters["Kind"];

            // Step 3 — Validate Count
            int count = (int)context.InputParameters["Count"];
            if (count < 1 || count > MaxCount)
                throw new InvalidPluginExecutionException("Count must be between 1 and 1000");

            // Step 4 — Compose sequence key
            string sequenceKey = $"{business.Trim().ToUpperInvariant()}-{asset.Trim().ToUpperInvariant()}-{unit.Trim().ToUpperInvariant()}-{domain.Trim().ToUpperInvariant()}-{system.Trim().ToUpperInvariant()}-{kind.Trim().ToUpperInvariant()}";

            // Step 5 — Retrieve or auto-create number sequence row
            Entity row = FindRow(service, sequenceKey);

            if (row == null)
            {
                var newRow = new Entity(EntityName);
                newRow[ColSequenceKey] = sequenceKey;
                newRow[ColLastIssued]  = 0;
                newRow[ColSeedValue]   = 0;
                newRow[ColStatus]      = new OptionSetValue(StatusHealthy);
                Guid rowId = service.Create(newRow);
                row = service.Retrieve(EntityName, rowId, new ColumnSet(true));
            }

            // Steps 6–11 — Compute range and update with optimistic locking.
            // IfRowVersionMatches rejects a stale write; on version conflict the exception
            // propagates and the caller must retry the entire invocation.
            // Do NOT catch exceptions from service calls — Dataverse's transaction count
            // tracking prohibits catch-and-continue in synchronous plugin context.
            int seedValue          = row.GetAttributeValue<int>(ColSeedValue);
            int currentLastIssued  = row.GetAttributeValue<int>(ColLastIssued);
            int baseValue          = Math.Max(currentLastIssued, seedValue);
            int proposedLastIssued = baseValue + count;

            if (proposedLastIssued > MaxNumber)
                throw new InvalidPluginExecutionException(
                    $"Issuing {count} numbers from {baseValue} would exceed {MaxNumber}");

            int[] issued = Enumerable.Range(baseValue + 1, count).ToArray();

            var updateEntity = new Entity(EntityName, row.Id);
            updateEntity.RowVersion       = row.RowVersion;
            updateEntity[ColLastIssued]   = proposedLastIssued;
            updateEntity[ColLastIssuedAt] = DateTime.UtcNow;
            updateEntity[ColStatus]       = new OptionSetValue(ComputeStatus(proposedLastIssued));

            service.Execute(new Microsoft.Xrm.Sdk.Messages.UpdateRequest
            {
                Target              = updateEntity,
                ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches,
            });

            // Step 12 — Write output parameters
            context.OutputParameters["IssuedNumbers"]   = JsonConvert.SerializeObject(issued);
            context.OutputParameters["SequenceKey"]     = sequenceKey;
            context.OutputParameters["NewLastIssued"]   = proposedLastIssued;
            context.OutputParameters["Status"]          = new OptionSetValue(ComputeStatus(proposedLastIssued));

            // When invoked during approval, stamp the issued numbers onto the reservation
            // as SYSTEM so the approver needs no write privilege on it. This Update triggers
            // AutoCreateDrawingsPlugin (the reservation is already Approved by this point).
            if (context.InputParameters.TryGetValue("Reservation", out var resObj) && resObj is EntityReference resRef)
            {
                var resUpdate = new Entity(resRef.LogicalName, resRef.Id)
                {
                    ["enmax_acdnissuednumbers"] = JsonConvert.SerializeObject(issued),
                };
                service.Update(resUpdate);
            }
        }

        // -----------------------------------------------------------------------
        // Helpers
        // -----------------------------------------------------------------------

        private static Entity FindRow(IOrganizationService service, string sequenceKey)
        {
            var query = new QueryExpression(EntityName)
            {
                TopCount  = 1,
                ColumnSet = new ColumnSet("enmax_autocadnumbersequenceid")
            };
            query.Criteria.AddCondition(ColSequenceKey, ConditionOperator.Equal, sequenceKey);

            var results = service.RetrieveMultiple(query);
            if (results.Entities.Count == 0) return null;

            // Retrieve by ID so that Entity.RowVersion is populated.
            // RetrieveMultiple via the plugin's WCF service does not reliably set RowVersion;
            // Retrieve by ID always does, which is required for ConcurrencyBehavior.IfRowVersionMatches.
            return service.Retrieve(EntityName, results.Entities[0].Id, new ColumnSet(true));
        }

        private static int ComputeStatus(int lastIssued)
        {
            if (lastIssued >= MaxNumber)        return StatusExhausted;
            if (lastIssued >= CriticalThreshold) return StatusCritical;
            if (lastIssued >= WarningThreshold)  return StatusWarning;
            return StatusHealthy;
        }
    }
}
