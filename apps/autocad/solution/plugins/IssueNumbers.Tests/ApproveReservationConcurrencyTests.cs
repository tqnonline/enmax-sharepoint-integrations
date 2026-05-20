using System;
using System.Linq;
using System.Threading.Tasks;
using FluentAssertions;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Integration tests for ApproveReservationPlugin against a real Dataverse org.
    ///
    /// Tests verify:
    ///   1. N parallel callers approving the same reservation all succeed (idempotent).
    ///   2. Final row state is correct: status=Approved, approvedOn set, approver set.
    ///   3. Calling approve on an already-approved reservation never throws.
    ///
    /// Tagged Category=Integration — excluded from the CI unit-test gate via:
    ///   dotnet test --filter "Category!=Integration"
    ///
    /// Requires environment variables (same keys as .env.dev):
    ///   ENVIRONMENT_URL, CLIENT_ID, CLIENT_SECRET, TENANT_ID
    /// </summary>
    public class ApproveReservationConcurrencyTests : IClassFixture<DataverseFixture>
    {
        private const int StatusApproved = 2;

        private readonly DataverseFixture _fx;

        public ApproveReservationConcurrencyTests(DataverseFixture fx) => _fx = fx;

        // -----------------------------------------------------------------------
        // Test 1 — 10 parallel callers approving the same pending reservation
        //          Asserts: all succeed (idempotent), final state is Approved
        // -----------------------------------------------------------------------

        [Fact]
        [Trait("Category", "Integration")]
        public async Task Approve_10Parallel_AllSucceed_FinalStateIsApproved()
        {
            SkipIfNoDataverse();

            // Arrange: create a fresh pending reservation
            var reservationId = await _fx.CreatePendingReservationAsync().ConfigureAwait(false);

            try
            {
                const int N = 10;
                var tasks = Enumerable.Range(0, N)
                    .Select(_ => _fx.InvokeApproveReservationAsync(reservationId))
                    .ToArray();

                // Act: fire all 10 approve calls concurrently
                Func<Task> act = () => Task.WhenAll(tasks);

                // Assert: none throw — plugin is idempotent for already-approved rows
                await act.Should().NotThrowAsync(
                    because: "approving the same reservation concurrently must be idempotent — " +
                             "second+ callers hit the already-Approved status and return a no-op");

                // Assert final state
                var snapshot = await _fx.GetReservationSnapshotAsync(reservationId).ConfigureAwait(false);

                snapshot.Status.Should().Be(StatusApproved,
                    because: "reservation must end up Approved regardless of how many concurrent callers raced");

                snapshot.ApprovedOn.Should().NotBeNull(
                    because: "enmax_acdnapprovedon must be stamped on approval");

                snapshot.ApprovedOn.Value.Should().BeCloseTo(DateTime.UtcNow, precision: TimeSpan.FromSeconds(30),
                    because: "approvedOn should be within 30s of the test run");

                snapshot.Approver.Should().NotBeNull(
                    because: "enmax_acdnapprover lookup must be set to the calling service principal");
            }
            finally
            {
                // Cleanup — always delete the test row
                await _fx.DeleteReservationAsync(reservationId).ConfigureAwait(false);
            }
        }

        // -----------------------------------------------------------------------
        // Test 2 — Approve an already-approved reservation sequentially
        //          Asserts: second call is a silent no-op; approvedOn is NOT reset
        // -----------------------------------------------------------------------

        [Fact]
        [Trait("Category", "Integration")]
        public async Task Approve_AlreadyApproved_IsIdempotent_ApprovedOnNotReset()
        {
            SkipIfNoDataverse();

            var reservationId = await _fx.CreatePendingReservationAsync().ConfigureAwait(false);

            try
            {
                // First approval
                await _fx.InvokeApproveReservationAsync(reservationId).ConfigureAwait(false);
                var firstSnapshot = await _fx.GetReservationSnapshotAsync(reservationId).ConfigureAwait(false);

                // Small delay so we can detect if approvedOn gets incorrectly overwritten
                await Task.Delay(1500).ConfigureAwait(false);

                // Second approval — must not throw
                Func<Task> secondApprove = () => _fx.InvokeApproveReservationAsync(reservationId);
                await secondApprove.Should().NotThrowAsync(
                    because: "approving an already-approved reservation must be a silent no-op");

                var secondSnapshot = await _fx.GetReservationSnapshotAsync(reservationId).ConfigureAwait(false);

                secondSnapshot.Status.Should().Be(StatusApproved,
                    because: "status must remain Approved");

                secondSnapshot.ApprovedOn.Should().Be(firstSnapshot.ApprovedOn,
                    because: "the plugin must not overwrite approvedOn on a no-op call — " +
                             "the original approval timestamp is the authoritative record");
            }
            finally
            {
                await _fx.DeleteReservationAsync(reservationId).ConfigureAwait(false);
            }
        }

        // -----------------------------------------------------------------------
        // Private helpers
        // -----------------------------------------------------------------------

        private static void SkipIfNoDataverse()
        {
            bool missing =
                string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ENVIRONMENT_URL"))  ||
                string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("CLIENT_ID"))        ||
                string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("CLIENT_SECRET"))    ||
                string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("TENANT_ID"));

            if (missing)
                throw new SkipException(
                    "Requires Dataverse connection: set ENVIRONMENT_URL, CLIENT_ID, " +
                    "CLIENT_SECRET, TENANT_ID (same keys as .env.dev).");
        }
    }
}
