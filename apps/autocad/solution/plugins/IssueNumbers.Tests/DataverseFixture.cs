using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Result data returned from the enmax_acdnIssueNumbers custom action.
    /// </summary>
    public class IssueNumbersResult
    {
        public int[]  IssuedNumbers  { get; set; }
        public string SequenceKey    { get; set; }
        public int    NewLastIssued  { get; set; }
        public int    Status         { get; set; }
    }

    /// <summary>
    /// xUnit class fixture that authenticates to a dev Dataverse tenant via service principal
    /// and exposes helpers for the concurrency integration tests.
    ///
    /// Required environment variables (set by CD pipeline):
    ///   DATAVERSE_URL           – e.g. https://&lt;dev-org&gt;.crm3.dynamics.com
    ///   DATAVERSE_CLIENT_ID     – service-principal application (client) ID
    ///   DATAVERSE_CLIENT_SECRET – service-principal client secret
    ///   DATAVERSE_TENANT_ID     – Azure AD tenant ID
    ///
    /// If any variable is absent the fixture construction is deferred until the first call
    /// to <see cref="InvokeIssueNumbersAsync"/> or <see cref="ResetSequenceAsync"/>,
    /// which will throw <see cref="InvalidOperationException"/> with a clear message.
    /// The integration tests catch the missing-env-var state and skip themselves.
    /// </summary>
    public class DataverseFixture : IDisposable
    {
        // -----------------------------------------------------------------------
        // Constants – match the Dataverse schema
        // -----------------------------------------------------------------------

        private const string EntityName     = "enmax_autocadnumbersequence";
        private const string ColSequenceKey = "enmax_acdnsequencekey";
        private const string ActionName     = "enmax_acdnIssueNumbers";

        // -----------------------------------------------------------------------
        // Fields
        // -----------------------------------------------------------------------

        private readonly ServiceClient _client;
        private readonly string        _failureReason;

        // -----------------------------------------------------------------------
        // Constructor
        // -----------------------------------------------------------------------

        public DataverseFixture()
        {
            var url      = Environment.GetEnvironmentVariable("DATAVERSE_URL");
            var clientId = Environment.GetEnvironmentVariable("DATAVERSE_CLIENT_ID");
            var secret   = Environment.GetEnvironmentVariable("DATAVERSE_CLIENT_SECRET");
            var tenantId = Environment.GetEnvironmentVariable("DATAVERSE_TENANT_ID");

            if (string.IsNullOrWhiteSpace(url)      ||
                string.IsNullOrWhiteSpace(clientId) ||
                string.IsNullOrWhiteSpace(secret)   ||
                string.IsNullOrWhiteSpace(tenantId))
            {
                _failureReason =
                    "Integration tests require DATAVERSE_URL, DATAVERSE_CLIENT_ID, " +
                    "DATAVERSE_CLIENT_SECRET, and DATAVERSE_TENANT_ID environment variables.";
                return;
            }

            // Construct the ServiceClient connection string for client credentials flow.
            // Format: AuthType=ClientSecret; Url=<org>; ClientId=<id>; ClientSecret=<secret>; TenantId=<tid>
            var connectionString =
                $"AuthType=ClientSecret;" +
                $"Url={url};" +
                $"ClientId={clientId};" +
                $"ClientSecret={secret};" +
                $"TenantId={tenantId}";

            _client = new ServiceClient(connectionString);

            if (!_client.IsReady)
            {
                _failureReason =
                    "Dataverse ServiceClient failed to connect: " +
                    (_client.LastError ?? "(no error details)");
            }
        }

        // -----------------------------------------------------------------------
        // Public API
        // -----------------------------------------------------------------------

        /// <summary>
        /// Invokes the enmax_acdnIssueNumbers custom action on the Dataverse org.
        /// Throws <see cref="InvalidOperationException"/> when env vars are missing.
        /// </summary>
        public async Task<IssueNumbersResult> InvokeIssueNumbersAsync(
            string business, string asset,  string unit,
            string domain,   string system, string kind,
            int    count)
        {
            EnsureReady();

            var request = new OrganizationRequest(ActionName)
            {
                Parameters =
                {
                    ["Business"] = business,
                    ["Asset"]    = asset,
                    ["Unit"]     = unit,
                    ["Domain"]   = domain,
                    ["System"]   = system,
                    ["Kind"]     = kind,
                    ["Count"]    = count,
                }
            };

            var response = await _client.ExecuteAsync(request).ConfigureAwait(false);

            // Parse output parameters
            var issuedRaw = response.Results.Contains("IssuedNumbers")
                ? response.Results["IssuedNumbers"]
                : null;

            int[] issued;
            if (issuedRaw is string json)
            {
                issued = Newtonsoft.Json.JsonConvert.DeserializeObject<int[]>(json)
                         ?? Array.Empty<int>();
            }
            else if (issuedRaw is int[] arr)
            {
                issued = arr;
            }
            else
            {
                throw new InvalidOperationException(
                    $"IssuedNumbers response has unexpected type {issuedRaw?.GetType().Name ?? "null"}. " +
                    "Expected string (JSON) or int[]. Custom action may not be deployed.");
            }

            var newLast = response.Results.Contains("NewLastIssued")
                ? Convert.ToInt32(response.Results["NewLastIssued"])
                : 0;

            var sequenceKey = response.Results.Contains("SequenceKey")
                ? (string)response.Results["SequenceKey"]
                : string.Empty;

            var statusRaw = response.Results.Contains("Status")
                ? response.Results["Status"]
                : null;

            int statusValue = 0;
            if (statusRaw is OptionSetValue osv)
                statusValue = osv.Value;
            else if (statusRaw != null)
                statusValue = Convert.ToInt32(statusRaw);

            return new IssueNumbersResult
            {
                IssuedNumbers = issued,
                SequenceKey   = sequenceKey,
                NewLastIssued = newLast,
                Status        = statusValue,
            };
        }

        /// <summary>
        /// Deletes the sequence row for <paramref name="sequenceKey"/> if it exists.
        /// Idempotent — does not throw when the row is absent.
        /// </summary>
        public Task ResetSequenceAsync(string sequenceKey)
        {
            EnsureReady();

            var query = new QueryExpression(EntityName)
            {
                ColumnSet  = new ColumnSet("enmax_autocadnumbersequenceid"),
                TopCount   = 1,
                Criteria   =
                {
                    Conditions =
                    {
                        new ConditionExpression(
                            ColSequenceKey,
                            ConditionOperator.Equal,
                            sequenceKey)
                    }
                }
            };

            var result = _client.RetrieveMultiple(query);

            foreach (var entity in result.Entities)
            {
                _client.Delete(EntityName, entity.Id);
            }

            return System.Threading.Tasks.Task.CompletedTask;
        }

        // -----------------------------------------------------------------------
        // IDisposable
        // -----------------------------------------------------------------------

        public void Dispose()
        {
            _client?.Dispose();
        }

        // -----------------------------------------------------------------------
        // Private helpers
        // -----------------------------------------------------------------------

        private void EnsureReady()
        {
            if (_failureReason != null)
                throw new InvalidOperationException(_failureReason);
        }
    }
}
