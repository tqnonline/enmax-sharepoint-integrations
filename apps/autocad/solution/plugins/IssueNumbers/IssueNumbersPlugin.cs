using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.ServiceModel;
using System.Threading;

namespace IssueNumbers
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
        private const int MaxRetries          = 3;
        private const int ConcurrencyVersionMismatchCode = -2147088254;
        private const int DuplicateDetectedCode          =  2147319761;

        private static readonly int[] BackoffMs = { 100, 200, 400 };

        private const string EntityName      = "enmax_autocadnumbersequence";
        private const string ColSequenceKey  = "enmax_acdnsequencekey";
        private const string ColLastIssued   = "enmax_acdnlastissued";
        private const string ColSeedValue    = "enmax_acdnseedvalue";
        private const string ColLastIssuedAt = "enmax_acdnlastissuedat";
        private const string ColStatus       = "enmax_acdnstatus";

        // -----------------------------------------------------------------------
        // Sleep injection (for test #19 backoff verification)
        // -----------------------------------------------------------------------

        private static readonly Action<int> DefaultSleep = ms => Thread.Sleep(ms);

        /// <summary>
        /// Tests set this before calling ExecutePluginWith to inject a fake sleep.
        /// Reset to null after the call to avoid cross-test contamination.
        /// </summary>
        public static Action<int> SleepOverride { get; set; } = null;

        private Action<int> Sleep => SleepOverride ?? DefaultSleep;

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
            var service = localPluginContext.InitiatingUserService;

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

                try
                {
                    Guid rowId = service.Create(newRow);
                    row = service.Retrieve(EntityName, rowId, new ColumnSet(true));
                }
                catch (FaultException<OrganizationServiceFault> ex)
                    when (ex.Detail?.ErrorCode == DuplicateDetectedCode)
                {
                    // Another caller won the race — retrieve the row they created
                    row = FindRow(service, sequenceKey);
                }
            }

            // Step 6 — Compute base value
            int currentLastIssued = row.GetAttributeValue<int>(ColLastIssued);
            int seedValue         = row.GetAttributeValue<int>(ColSeedValue);
            int baseValue         = Math.Max(currentLastIssued, seedValue);

            // Step 7 — Ceiling check
            int proposedLastIssued = baseValue + count;
            if (proposedLastIssued > MaxNumber)
                throw new InvalidPluginExecutionException(
                    $"Issuing {count} numbers from {baseValue} would exceed {MaxNumber}");

            // Step 8 — Issued array
            int[] issued = Enumerable.Range(baseValue + 1, count).ToArray();

            // Step 10 — Build update entity
            var updateEntity = new Entity(EntityName, row.Id);
            updateEntity[ColLastIssued]  = proposedLastIssued;
            updateEntity[ColLastIssuedAt] = DateTime.UtcNow;
            updateEntity[ColStatus]      = new OptionSetValue(ComputeStatus(proposedLastIssued));

            // Step 11 — Retry update loop (ALL inside ExecuteDataversePlugin)
            // Use Execute(UpdateRequest) so FakeXrmEasy message executors intercept it in tests.
            int attempt = 0;
            while (true)
            {
                try
                {
                    service.Execute(new Microsoft.Xrm.Sdk.Messages.UpdateRequest { Target = updateEntity });
                    break;
                }
                catch (FaultException<OrganizationServiceFault> ex)
                    when (ex.Detail?.ErrorCode == ConcurrencyVersionMismatchCode)
                {
                    attempt++;
                    if (attempt >= MaxRetries)
                        throw new InvalidPluginExecutionException(
                            "Could not issue numbers after 3 retries; please try again.");
                    Sleep(BackoffMs[attempt - 1]);
                }
            }

            // Step 12 — Write output parameters
            context.OutputParameters["IssuedNumbers"]   = JsonConvert.SerializeObject(issued);
            context.OutputParameters["SequenceKey"]     = sequenceKey;
            context.OutputParameters["NewLastIssued"]   = proposedLastIssued;
            context.OutputParameters["Status"]          = new OptionSetValue(ComputeStatus(proposedLastIssued));
        }

        // -----------------------------------------------------------------------
        // Helpers
        // -----------------------------------------------------------------------

        private static Entity FindRow(IOrganizationService service, string sequenceKey)
        {
            var query = new QueryExpression(EntityName)
            {
                TopCount  = 1,
                ColumnSet = new ColumnSet(true)
            };
            query.Criteria.AddCondition(ColSequenceKey, ConditionOperator.Equal, sequenceKey);

            var results = service.RetrieveMultiple(query);
            return results.Entities.Count > 0 ? results.Entities[0] : null;
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
