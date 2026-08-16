using System;
using System.Linq;
using System.ServiceModel;
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

    public class ReservationSnapshot
    {
        public int      Status     { get; set; }
        public DateTime? ApprovedOn { get; set; }
        public Guid?    Approver   { get; set; }
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
    public partial class DataverseFixture : IDisposable
    {
        // -----------------------------------------------------------------------
        // Constants – match the Dataverse schema
        // -----------------------------------------------------------------------

        private const string EntityName          = "enmax_autocadnumbersequence";
        private const string ColSequenceKey      = "enmax_acdnsequencekey";
        private const string ActionName          = "enmax_acdnIssueNumbers";

        private const string ReservationEntity   = "enmax_autocadreservation";
        private const string ColResStatus        = "enmax_acdnstatus";
        private const string ColResApprovedOn    = "enmax_acdnapprovedon";
        private const string ColResApprover      = "enmax_acdnapprover";
        private const string ApproveActionName   = "enmax_acdnApproveReservation";
        private const int    StatusPending       = 1;
        private const int    StatusApproved      = 2;

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
            var url      = Environment.GetEnvironmentVariable("ENVIRONMENT_URL");
            var clientId = Environment.GetEnvironmentVariable("CLIENT_ID");
            var secret   = Environment.GetEnvironmentVariable("CLIENT_SECRET");
            var tenantId = Environment.GetEnvironmentVariable("TENANT_ID");

            if (string.IsNullOrWhiteSpace(url)      ||
                string.IsNullOrWhiteSpace(clientId) ||
                string.IsNullOrWhiteSpace(secret)   ||
                string.IsNullOrWhiteSpace(tenantId))
            {
                _failureReason =
                    "Integration tests require ENVIRONMENT_URL, CLIENT_ID, " +
                    "CLIENT_SECRET, and TENANT_ID environment variables (same keys as .env.dev).";
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
        /// Retries up to 20 times with exponential backoff + jitter on concurrency conflicts
        /// (ConcurrencyVersionMismatch and DuplicateDetected).  The plugin intentionally
        /// does not retry internally — Dataverse's transaction count tracking prohibits
        /// catch-and-continue in synchronous plugin context.
        /// </summary>
        public Task<IssueNumbersResult> InvokeIssueNumbersAsync(
            string business, string asset,  string unit,
            string domain,   string system, string kind,
            int    count)
        {
            EnsureReady();
            return InvokeWithRetryAsync(
                () => InvokeIssueNumbersOnceAsync(business, asset, unit, domain, system, kind, count));
        }

        private async Task<IssueNumbersResult> InvokeIssueNumbersOnceAsync(
            string business, string asset,  string unit,
            string domain,   string system, string kind,
            int    count)
        {
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
        /// Resets the sequence row for <paramref name="sequenceKey"/> to lastIssued=0,
        /// creating it if it does not exist. Using Upsert (not delete+recreate) ensures
        /// the row is present before parallel callers fire, eliminating the Create race.
        /// </summary>
        public Task ResetSequenceAsync(string sequenceKey)
        {
            EnsureReady();

            var entity = new Entity(EntityName);
            entity.KeyAttributes[ColSequenceKey] = sequenceKey;
            entity["enmax_acdnlastissued"]        = 0;
            entity["enmax_acdnseedvalue"]          = 0;
            entity["enmax_acdnstatus"]             = new OptionSetValue(1); // StatusHealthy

            _client.Execute(new UpsertRequest { Target = entity });

            return Task.CompletedTask;
        }

        /// <summary>
        /// Creates a minimal pending reservation (status=1) for use in integration tests.
        /// Returns the new row's GUID. Caller is responsible for cleanup via
        /// <see cref="DeleteReservationAsync"/>.
        /// </summary>
        public async Task<Guid> CreatePendingReservationAsync()
        {
            EnsureReady();

            var entity = new Entity(ReservationEntity);
            entity[ColResStatus] = new OptionSetValue(StatusPending);

            // ExecuteAsync wraps Create so the call is awaitable
            var createRequest = new CreateRequest { Target = entity };
            var response      = (CreateResponse) await _client.ExecuteAsync(createRequest).ConfigureAwait(false);
            return response.id;
        }

        /// <summary>
        /// Invokes the enmax_acdnApproveReservation bound Custom API for the given reservation.
        /// Throws on HTTP error (non-204 from Dataverse).
        /// </summary>
        public async Task InvokeApproveReservationAsync(Guid reservationId)
        {
            EnsureReady();

            var request = new OrganizationRequest(ApproveActionName)
            {
                Parameters =
                {
                    ["Target"] = new EntityReference(ReservationEntity, reservationId),
                }
            };

            await _client.ExecuteAsync(request).ConfigureAwait(false);
        }

        /// <summary>
        /// Retrieves the current status, approvedOn, and approver fields for a reservation.
        /// </summary>
        public async Task<ReservationSnapshot> GetReservationSnapshotAsync(Guid reservationId)
        {
            EnsureReady();

            var retrieveRequest = new RetrieveRequest
            {
                Target    = new EntityReference(ReservationEntity, reservationId),
                ColumnSet = new ColumnSet(ColResStatus, ColResApprovedOn, ColResApprover),
            };

            var response = (RetrieveResponse) await _client.ExecuteAsync(retrieveRequest).ConfigureAwait(false);
            var entity   = response.Entity;

            return new ReservationSnapshot
            {
                Status     = entity.GetAttributeValue<OptionSetValue>(ColResStatus)?.Value ?? 0,
                ApprovedOn = entity.GetAttributeValue<DateTime?>(ColResApprovedOn),
                Approver   = entity.GetAttributeValue<EntityReference>(ColResApprover)?.Id,
            };
        }

        /// <summary>
        /// Deletes a reservation row. Idempotent — does not throw if the row is absent.
        /// </summary>
        public Task DeleteReservationAsync(Guid reservationId)
        {
            EnsureReady();

            try
            {
                _client.Delete(ReservationEntity, reservationId);
            }
            catch (Exception ex) when (ex.Message.Contains("Does Not Exist") ||
                                        ex.Message.Contains("0x80040217"))
            {
                // already deleted — idempotent
            }

            return Task.CompletedTask;
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

        /// <summary>
        /// Retries <paramref name="action"/> up to 20 times on concurrency conflicts.
        /// Backoff: 50 ms × 2^attempt + random jitter (capped at 2 000 ms).
        /// </summary>
        private static async Task<T> InvokeWithRetryAsync<T>(Func<Task<T>> action)
        {
            var rng = new Random();
            for (var attempt = 0; ; attempt++)
            {
                try
                {
                    return await action().ConfigureAwait(false);
                }
                catch (Exception ex) when (attempt < 20 && IsRetriableConcurrencyError(ex))
                {
                    var baseMs  = Math.Min(50 * (int)Math.Pow(2, attempt), 2000);
                    var jitterMs = rng.Next(0, Math.Max(1, baseMs / 2));
                    await Task.Delay(baseMs + jitterMs).ConfigureAwait(false);
                }
            }
        }

        private static bool IsRetriableConcurrencyError(Exception ex)
        {
            if (ex is FaultException<OrganizationServiceFault> fault)
            {
                var code = fault.Detail?.ErrorCode;
                if (code == -2147088254 || code == 2147319761)
                    return true;
            }
            // Dataverse wraps unhandled plugin faults; match on the system message text as fallback.
            var text = ex.ToString();
            return text.Contains("ConcurrencyVersionMismatch")
                || text.Contains("DuplicateDetected")
                || text.Contains("-2147088254")
                || text.Contains("RowVersion")
                || text.Contains("version of the existing record");
        }
    }
}
