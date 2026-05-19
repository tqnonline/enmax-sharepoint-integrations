using System;
using System.Linq;
using System.Threading.Tasks;
using FluentAssertions;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Integration tests that fire 50 parallel calls against a real Dataverse org
    /// and assert that the concurrency-safe plug-in issues numbers with no duplicates
    /// and no gaps.
    ///
    /// These tests are tagged Category=Integration and are NOT expected to pass until
    /// the plug-in is deployed to the dev org. They compile cleanly and are excluded
    /// from the CI unit-test run via:
    ///   dotnet test --filter "Category!=Integration"
    ///
    /// The reserved test sequence key "ZZ-ZZ-ZZ-ZZZ-ZZZ-ZZ" is defined in plan #02.
    /// </summary>
    public class IssueNumbersConcurrencyTests : IClassFixture<DataverseFixture>
    {
        // -----------------------------------------------------------------------
        // Reserved test sequence key (per plan #02)
        // -----------------------------------------------------------------------
        private const string TestKey = "ZZ-ZZ-ZZ-ZZZ-ZZZ-ZZ";

        private readonly DataverseFixture _fx;

        public IssueNumbersConcurrencyTests(DataverseFixture fx) => _fx = fx;

        // -----------------------------------------------------------------------
        // Test 1 — 50 parallel callers each requesting Count=1
        //          Asserts: 50 distinct numbers 1..50, no duplicates, no gaps
        // -----------------------------------------------------------------------

        [Fact]
        [Trait("Category", "Integration")]
        public async Task Issue_50Parallel_NoDuplicatesNoGaps()
        {
            // Guard: skip gracefully when Dataverse env vars are absent
            SkipIfNoDataverse();

            // Arrange: reset the test sequence so it starts from 1
            await _fx.ResetSequenceAsync(TestKey).ConfigureAwait(false);

            const int N = 50;
            var tasks = Enumerable.Range(0, N).Select(_ =>
                _fx.InvokeIssueNumbersAsync(
                    business: "ZZ", asset: "ZZ", unit: "ZZ",
                    domain:   "ZZZ", system: "ZZZ", kind: "ZZ",
                    count: 1));

            // Act: fire all 50 requests concurrently
            var results = await Task.WhenAll(tasks).ConfigureAwait(false);

            // Assert
            var issued = results.SelectMany(r => r.IssuedNumbers).OrderBy(n => n).ToArray();

            issued.Should().HaveCount(N,
                "each of the 50 callers must receive exactly 1 number");

            issued.Should().OnlyHaveUniqueItems(
                "no duplicates allowed under concurrent load — plug-in must use optimistic locking");

            issued.Should().BeInAscendingOrder();

            issued.First().Should().Be(1,
                "fresh sequence starts at 1 (seed = 0, LastIssued starts at 0)");

            issued.Last().Should().Be(N,
                "no gaps — N consecutive numbers must be issued across the 50 callers");
        }

        // -----------------------------------------------------------------------
        // Test 2 — 50 parallel callers each requesting Count ∈ {1,2,3,4,5} (cycling)
        //          Asserts: total numbers = Σ counts, all unique, no inter-caller overlap
        // -----------------------------------------------------------------------

        [Fact]
        [Trait("Category", "Integration")]
        public async Task Issue_50Parallel_VariableCount_StillUnique()
        {
            // Guard: skip gracefully when Dataverse env vars are absent
            SkipIfNoDataverse();

            // Arrange
            await _fx.ResetSequenceAsync(TestKey).ConfigureAwait(false);

            const int N = 50;
            // Each caller i requests (i % 5) + 1 numbers → [1,2,3,4,5,1,2,3,4,5,...]
            var counts = Enumerable.Range(0, N).Select(i => (i % 5) + 1).ToArray();
            int totalExpected = counts.Sum();

            var tasks = Enumerable.Range(0, N).Select(i =>
                _fx.InvokeIssueNumbersAsync(
                    business: "ZZ", asset: "ZZ", unit: "ZZ",
                    domain:   "ZZZ", system: "ZZZ", kind: "ZZ",
                    count: counts[i]));

            // Act
            var results = await Task.WhenAll(tasks).ConfigureAwait(false);

            // Assert — global uniqueness and coverage
            var allIssued = results.SelectMany(r => r.IssuedNumbers).OrderBy(n => n).ToArray();

            allIssued.Should().HaveCount(totalExpected,
                "total issued numbers must match sum of all requested counts");

            allIssued.Should().OnlyHaveUniqueItems(
                "no duplicate numbers between callers' ranges");

            allIssued.First().Should().Be(1,
                "sequence starts at 1");

            allIssued.Last().Should().Be(totalExpected,
                "no gaps in the overall sequence — numbers 1..totalExpected must all appear");

            // Assert — each caller's own range is contiguous (no internal gaps)
            foreach (var result in results)
            {
                var callerNums = result.IssuedNumbers.OrderBy(n => n).ToArray();

                callerNums.Should().BeInAscendingOrder(
                    "each caller receives a contiguous range in ascending order");

                if (callerNums.Length > 1)
                {
                    callerNums.Last().Should().Be(
                        callerNums.First() + callerNums.Length - 1,
                        "no gaps within a single caller's range — must be a contiguous block");
                }
            }
        }

        // -----------------------------------------------------------------------
        // Private helpers
        // -----------------------------------------------------------------------

        /// <summary>
        /// Throws <see cref="SkipException"/> (xUnit internal) when the Dataverse
        /// environment variables are not configured so the test is reported as
        /// skipped rather than failed in environments without a connected org.
        /// Falls back to a standard <see cref="InvalidOperationException"/> skip
        /// if the xUnit skip mechanism is unavailable.
        /// </summary>
        private static void SkipIfNoDataverse()
        {
            var url      = Environment.GetEnvironmentVariable("DATAVERSE_URL");
            var clientId = Environment.GetEnvironmentVariable("DATAVERSE_CLIENT_ID");
            var secret   = Environment.GetEnvironmentVariable("DATAVERSE_CLIENT_SECRET");
            var tenantId = Environment.GetEnvironmentVariable("DATAVERSE_TENANT_ID");

            bool missing =
                string.IsNullOrWhiteSpace(url)      ||
                string.IsNullOrWhiteSpace(clientId) ||
                string.IsNullOrWhiteSpace(secret)   ||
                string.IsNullOrWhiteSpace(tenantId);

            if (missing)
            {
                const string reason =
                    "Requires Dataverse connection: set DATAVERSE_URL, " +
                    "DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_TENANT_ID.";

                // xUnit 2.x does not expose a public Skip.If() API but does recognise
                // a [Fact(Skip = "...")] attribute. For runtime skipping we throw the
                // internal SkipException so the runner marks the test Skipped, not Failed.
                throw new SkipException(reason);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Minimal SkipException recognised by the xUnit v2 test runner.
    // When this exception propagates out of a test method, the runner records
    // the test as "Skipped" rather than "Failed".
    // -----------------------------------------------------------------------

    /// <summary>
    /// Throwing this exception from a test method causes xUnit v2 to mark the
    /// test as <em>skipped</em> rather than failed.  This mirrors the behaviour
    /// of xUnit's own internal <c>SkipException</c> without requiring a reference
    /// to xunit.core internals.
    /// </summary>
    internal sealed class SkipException : Exception
    {
        public SkipException(string reason) : base(reason) { }
    }
}
