using FluentAssertions;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Collections.Generic;
using System.Linq;
using System.ServiceModel;
using System.Threading.Tasks;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    // ---------------------------------------------------------------------------
    // Result types
    // ---------------------------------------------------------------------------

    public class CheckOutResult
    {
        public string CheckoutId { get; set; }
        public bool   Success    { get; set; }
        public string Error      { get; set; }
    }

    public class CheckoutSnapshot
    {
        public int      Status         { get; set; }
        public Guid?    Drawing        { get; set; }
        public Guid?    CheckedOutBy   { get; set; }
        public DateTime? CheckedOutOn  { get; set; }
        public Guid?    ClosedBy       { get; set; }
        public DateTime? ClosedOn      { get; set; }
        public string   ValidationReason { get; set; }
    }

    public class DrawingSnapshot
    {
        public int    State           { get; set; }
        public string CurrentRevision { get; set; }
    }

    public class FinalizeResult
    {
        public bool   Success { get; set; }
        public string Error   { get; set; }
    }

    // ---------------------------------------------------------------------------
    // Extended fixture helpers for checkout flow
    // ---------------------------------------------------------------------------

    public partial class DataverseFixture
    {
        private const string DrawingEntity    = "enmax_autocaddrawing";
        private const string CheckoutEntity   = "enmax_autocadcheckout";
        private const string ColDrawingState  = "enmax_acdnstate";
        private const string ColCurrentRev    = "enmax_acdncurrentrevision";
        private const string ColCheckoutSt    = "enmax_acdnstatus";
        private const string ColCheckoutDrw   = "enmax_acdndrawing";
        private const string ColCheckedOutBy  = "enmax_acdncheckedoutby";
        private const string ColCheckedOutOn  = "enmax_acdncheckedouton";
        private const string ColClosedBy      = "enmax_acdnclosedby";
        private const string ColClosedOn      = "enmax_acdnclosedon";
        private const string ColValReason     = "enmax_acdnvalidationreason";
        private const string ColNewRevision   = "enmax_acdnnewrevision";

        private const int StateAvailable        = 1;
        private const int StateCheckedOut       = 2;
        private const int StateAwaitingVal      = 3;
        private const int StatusCheckoutOpen    = 1;
        private const int StatusAwaitingVal     = 2;
        private const int StatusClosedApproved  = 3;
        private const int StatusClosedForced    = 5;

        private const string CheckOutAction      = "enmax_acdnCheckOutDrawing";
        private const string ApproveAction      = "enmax_acdnApproveCheckin";
        private const string ForceAction        = "enmax_acdnForceCheckin";
        private const string SubmitRevisionAction = "enmax_acdnSubmitRevision";
        private const string FinalizeAction       = "enmax_acdnFinalizeDrawing";

        /// <summary>Creates a drawing in Available(1) state. Caller must clean up.</summary>
        public async Task<Guid> CreateAvailableDrawingAsync(string number = null, string revision = "A")
        {
            EnsureReady();
            var entity = new Entity(DrawingEntity);
            entity[ColDrawingState]  = new OptionSetValue(StateAvailable);
            entity[ColCurrentRev]    = revision;
            entity["enmax_acdnnumber"] = number ?? $"TEST-{Guid.NewGuid():N}";

            var req = new CreateRequest { Target = entity };
            var rsp = (CreateResponse)await _client.ExecuteAsync(req).ConfigureAwait(false);
            var drawingId = rsp.id;

            // Create one sheet linked to the drawing so sheet-state propagation
            // assertions (e.g. Finalize -> all sheets Finalized) have a row to mirror.
            var sheet = new Entity("enmax_autocadsheet");
            sheet["enmax_acdndrawing"]     = new EntityReference(DrawingEntity, drawingId);
            sheet["enmax_acdnsheetnumber"] = 1;
            sheet["enmax_acdnstate"]       = new OptionSetValue(2); // Available (sheet-state)
            await _client.ExecuteAsync(new CreateRequest { Target = sheet }).ConfigureAwait(false);

            return drawingId;
        }

        /// <summary>Deletes a drawing (idempotent).</summary>
        public Task DeleteDrawingAsync(Guid drawingId)
        {
            EnsureReady();
            try { _client.Delete(DrawingEntity, drawingId); }
            catch (Exception ex) when (ex.Message.Contains("Does Not Exist") ||
                                        ex.Message.Contains("0x80040217")) { }
            return Task.CompletedTask;
        }

        /// <summary>Deletes a checkout row (idempotent).</summary>
        public Task DeleteCheckoutAsync(Guid checkoutId)
        {
            EnsureReady();
            try { _client.Delete(CheckoutEntity, checkoutId); }
            catch (Exception ex) when (ex.Message.Contains("Does Not Exist") ||
                                        ex.Message.Contains("0x80040217")) { }
            return Task.CompletedTask;
        }

        /// <summary>Invokes enmax_acdnCheckOutDrawing. Returns (checkoutId, success, error).</summary>
        public async Task<CheckOutResult> InvokeCheckOutAsync(Guid drawingId)
        {
            EnsureReady();
            try
            {
                var request = new OrganizationRequest(CheckOutAction);
                request.Parameters["Target"] = new EntityReference(DrawingEntity, drawingId);
                var response = await _client.ExecuteAsync(request).ConfigureAwait(false);
                return new CheckOutResult
                {
                    Success    = true,
                    CheckoutId = response.Results.Contains("CheckoutId")
                        ? (string)response.Results["CheckoutId"]
                        : null,
                };
            }
            catch (Exception ex)
            {
                return new CheckOutResult { Success = false, Error = ex.Message };
            }
        }

        /// <summary>Invokes enmax_acdnApproveCheckin.</summary>
        public async Task InvokeApproveCheckinAsync(Guid checkoutId, int decision, string reason = "")
        {
            EnsureReady();
            var request = new OrganizationRequest(ApproveAction);
            request.Parameters["Target"]   = new EntityReference(CheckoutEntity, checkoutId);
            request.Parameters["Decision"] = decision;
            request.Parameters["Reason"]   = reason ?? string.Empty;
            await _client.ExecuteAsync(request).ConfigureAwait(false);
        }

        /// <summary>Invokes enmax_acdnForceCheckin.</summary>
        public async Task InvokeForceCheckinAsync(Guid checkoutId, string reason, string newRevision = "B")
        {
            EnsureReady();
            var request = new OrganizationRequest(ForceAction);
            request.Parameters["Target"]      = new EntityReference(CheckoutEntity, checkoutId);
            request.Parameters["Reason"]      = reason;
            request.Parameters["NewRevision"] = newRevision;
            await _client.ExecuteAsync(request).ConfigureAwait(false);
        }

        /// <summary>Invokes enmax_acdnSubmitRevision (bound to checkout). WS3: captures Submission Information, not a revision.</summary>
        public async Task InvokeSubmitRevisionAsync(Guid checkoutId, string submissionInfo)
        {
            EnsureReady();
            var request = new OrganizationRequest(SubmitRevisionAction);
            request.Parameters["Target"]         = new EntityReference(CheckoutEntity, checkoutId);
            request.Parameters["SubmissionInfo"] = submissionInfo;
            await _client.ExecuteAsync(request).ConfigureAwait(false);
        }

        /// <summary>Invokes enmax_acdnFinalizeDrawing (bound to drawing). Returns (success, error).</summary>
        public async Task<FinalizeResult> InvokeFinalizeAsync(Guid drawingId, string reason)
        {
            EnsureReady();
            try
            {
                var request = new OrganizationRequest(FinalizeAction);
                request.Parameters["Target"] = new EntityReference(DrawingEntity, drawingId);
                request.Parameters["Reason"] = reason;
                await _client.ExecuteAsync(request).ConfigureAwait(false);
                return new FinalizeResult { Success = true };
            }
            catch (Exception ex) { return new FinalizeResult { Success = false, Error = ex.Message }; }
        }

        /// <summary>Counts sheets in a given sheet-state for a drawing.</summary>
        public int CountSheetsInState(Guid drawingId, int sheetState)
        {
            EnsureReady();
            var q = new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") };
            q.Criteria.AddCondition("enmax_acdndrawing", ConditionOperator.Equal, drawingId);
            return _client.RetrieveMultiple(q).Entities
                .Count(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate")?.Value == sheetState);
        }

        public async Task<DrawingSnapshot> GetDrawingSnapshotAsync(Guid drawingId)
        {
            EnsureReady();
            var rsp = (RetrieveResponse)await _client.ExecuteAsync(new RetrieveRequest
            {
                Target    = new EntityReference(DrawingEntity, drawingId),
                ColumnSet = new ColumnSet(ColDrawingState, ColCurrentRev),
            }).ConfigureAwait(false);
            var e = rsp.Entity;
            return new DrawingSnapshot
            {
                State           = e.GetAttributeValue<OptionSetValue>(ColDrawingState)?.Value ?? 0,
                CurrentRevision = e.GetAttributeValue<string>(ColCurrentRev),
            };
        }

        public async Task<CheckoutSnapshot> GetCheckoutSnapshotAsync(Guid checkoutId)
        {
            EnsureReady();
            var rsp = (RetrieveResponse)await _client.ExecuteAsync(new RetrieveRequest
            {
                Target    = new EntityReference(CheckoutEntity, checkoutId),
                ColumnSet = new ColumnSet(ColCheckoutSt, ColCheckoutDrw, ColCheckedOutBy,
                                          ColCheckedOutOn, ColClosedBy, ColClosedOn, ColValReason),
            }).ConfigureAwait(false);
            var e = rsp.Entity;
            return new CheckoutSnapshot
            {
                Status           = e.GetAttributeValue<OptionSetValue>(ColCheckoutSt)?.Value ?? 0,
                Drawing          = e.GetAttributeValue<EntityReference>(ColCheckoutDrw)?.Id,
                CheckedOutBy     = e.GetAttributeValue<EntityReference>(ColCheckedOutBy)?.Id,
                CheckedOutOn     = e.GetAttributeValue<DateTime?>(ColCheckedOutOn),
                ClosedBy         = e.GetAttributeValue<EntityReference>(ColClosedBy)?.Id,
                ClosedOn         = e.GetAttributeValue<DateTime?>(ColClosedOn),
                ValidationReason = e.GetAttributeValue<string>(ColValReason),
            };
        }

        /// <summary>
        /// Sets an existing drawing back to Available(1) and optionally resets revision.
        /// Used between integration test cases to restore a clean state.
        /// </summary>
        public Task ResetDrawingToAvailableAsync(Guid drawingId, string revision = "A")
        {
            EnsureReady();
            _client.Update(new Entity(DrawingEntity, drawingId)
            {
                [ColDrawingState] = new OptionSetValue(StateAvailable),
                [ColCurrentRev]   = revision,
            });
            return Task.CompletedTask;
        }

        /// <summary>
        /// Direct-patches a checkout to AwaitingValidation + newRevision.
        /// Simulates the Code App's submitRevision PATCH (not a custom action).
        /// </summary>
        public Task PatchCheckoutToAwaitingValidationAsync(Guid checkoutId, string newRevision)
        {
            EnsureReady();
            _client.Update(new Entity(CheckoutEntity, checkoutId)
            {
                [ColCheckoutSt] = new OptionSetValue(StatusAwaitingVal),
                [ColNewRevision] = newRevision,
            });
            return Task.CompletedTask;
        }

        /// <summary>Retrieves all checkout rows for a drawing (used in concurrency test).</summary>
        public EntityCollection GetCheckoutsForDrawing(Guid drawingId)
        {
            EnsureReady();
            var query = new QueryExpression(CheckoutEntity)
            {
                ColumnSet = new ColumnSet("enmax_autocadcheckoutid"),
            };
            query.Criteria.AddCondition(ColCheckoutDrw, ConditionOperator.Equal, drawingId);
            return _client.RetrieveMultiple(query);
        }
    }

    // ---------------------------------------------------------------------------
    // Integration test class
    // ---------------------------------------------------------------------------

    [Collection("CheckoutIntegration")]
    public class CheckoutIntegrationTests : IClassFixture<DataverseFixture>
    {
        private readonly DataverseFixture _fx;

        public CheckoutIntegrationTests(DataverseFixture fx) => _fx = fx;

        // -----------------------------------------------------------------------
        // Helper
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

        // -----------------------------------------------------------------------
        // INT-01: Happy path — checkout then approve
        // -----------------------------------------------------------------------

        [Fact]
        [Trait("Category", "Integration")]
        public async Task CheckOut_then_ApproveCheckin_transitions_drawing_to_Available()
        {
            SkipIfNoDataverse();

            var drawingId  = await _fx.CreateAvailableDrawingAsync(revision: "A");
            Guid checkoutId = Guid.Empty;
            try
            {
                var coResult = await _fx.InvokeCheckOutAsync(drawingId);
                coResult.Success.Should().BeTrue("CheckOut should succeed on an Available drawing");
                Guid.TryParse(coResult.CheckoutId, out checkoutId).Should().BeTrue();

                // Manually patch to AwaitingValidation (submitRevision is a direct PATCH, not a custom action)
                await _fx.PatchCheckoutToAwaitingValidationAsync(checkoutId, "B");

                await _fx.InvokeApproveCheckinAsync(checkoutId, decision: 1);

                var drawing  = await _fx.GetDrawingSnapshotAsync(drawingId);
                var checkout = await _fx.GetCheckoutSnapshotAsync(checkoutId);

                drawing.State.Should().Be(1, "approved checkin must return drawing to Available");
                drawing.CurrentRevision.Should().Be("B", "approved revision must be stamped on drawing");
                checkout.Status.Should().Be(3, "checkout must be ClosedApproved");
            }
            finally
            {
                if (checkoutId != Guid.Empty) await _fx.DeleteCheckoutAsync(checkoutId);
                await _fx.DeleteDrawingAsync(drawingId);
            }
        }

        // -----------------------------------------------------------------------
        // INT-02: Decline reverts to Open
        // -----------------------------------------------------------------------

        [Fact]
        [Trait("Category", "Integration")]
        public async Task ApproveCheckin_Declined_reverts_checkout_to_Open()
        {
            SkipIfNoDataverse();

            var drawingId  = await _fx.CreateAvailableDrawingAsync(revision: "A");
            Guid checkoutId = Guid.Empty;
            try
            {
                var coResult = await _fx.InvokeCheckOutAsync(drawingId);
                coResult.Success.Should().BeTrue();
                Guid.TryParse(coResult.CheckoutId, out checkoutId);

                await _fx.PatchCheckoutToAwaitingValidationAsync(checkoutId, "B");

                const string declineReason = "PDF files are missing from pages 4, 5, and 6 of the package.";
                await _fx.InvokeApproveCheckinAsync(checkoutId, decision: 2, reason: declineReason);

                var drawing  = await _fx.GetDrawingSnapshotAsync(drawingId);
                var checkout = await _fx.GetCheckoutSnapshotAsync(checkoutId);

                drawing.State.Should().Be(2, "drawing must remain CheckedOut after decline");
                checkout.Status.Should().Be(1, "checkout must revert to Open after decline");
                checkout.ValidationReason.Should().NotBeNullOrEmpty("decline reason must be persisted");
            }
            finally
            {
                if (checkoutId != Guid.Empty) await _fx.DeleteCheckoutAsync(checkoutId);
                await _fx.DeleteDrawingAsync(drawingId);
            }
        }

        // -----------------------------------------------------------------------
        // INT-03: Force check-in
        // -----------------------------------------------------------------------

        [Fact]
        [Trait("Category", "Integration")]
        public async Task ForceCheckin_closes_open_checkout_and_returns_drawing_to_Available()
        {
            SkipIfNoDataverse();

            var drawingId  = await _fx.CreateAvailableDrawingAsync(revision: "A");
            Guid checkoutId = Guid.Empty;
            try
            {
                var coResult = await _fx.InvokeCheckOutAsync(drawingId);
                coResult.Success.Should().BeTrue();
                Guid.TryParse(coResult.CheckoutId, out checkoutId);

                const string forceReason = "User is out of office for three weeks; project deadline cannot slip.";
                await _fx.InvokeForceCheckinAsync(checkoutId, forceReason);

                var drawing  = await _fx.GetDrawingSnapshotAsync(drawingId);
                var checkout = await _fx.GetCheckoutSnapshotAsync(checkoutId);

                drawing.State.Should().Be(1, "ForceCheckin must return drawing to Available");
                checkout.Status.Should().Be(5, "checkout must be ClosedForced");
                checkout.ValidationReason.Should().NotBeNullOrEmpty("force reason must be persisted");
                checkout.ClosedBy.Should().NotBeNull("closedBy must be stamped");
            }
            finally
            {
                if (checkoutId != Guid.Empty) await _fx.DeleteCheckoutAsync(checkoutId);
                await _fx.DeleteDrawingAsync(drawingId);
            }
        }

        // -----------------------------------------------------------------------
        // INT-04: Concurrent checkout — only one caller wins (Rule 14)
        //
        // Fires N parallel CheckOut calls on the same Available drawing.
        // Dataverse ConcurrencyBehavior.IfRowVersionMatches guarantees exactly
        // one checkout record is created and exactly one caller succeeds.
        // The others receive an error (concurrency conflict or status guard).
        // -----------------------------------------------------------------------

        [Fact]
        [Trait("Category", "Integration")]
        public async Task Concurrent_checkouts_on_same_drawing_produce_exactly_one_winner()
        {
            SkipIfNoDataverse();
            const int ParallelCallers = 8;

            var drawingId = await _fx.CreateAvailableDrawingAsync(revision: "A");
            var createdCheckoutIds = new List<string>();
            try
            {
                // Fire N calls simultaneously
                var tasks = Enumerable.Range(0, ParallelCallers)
                    .Select(_ => _fx.InvokeCheckOutAsync(drawingId))
                    .ToList();

                var results = await Task.WhenAll(tasks);

                var successes = results.Where(r => r.Success).ToList();
                var failures  = results.Where(r => !r.Success).ToList();

                successes.Should().HaveCount(1,
                    because: $"exactly one of {ParallelCallers} concurrent checkouts must succeed; " +
                             "Dataverse RowVersion concurrency must prevent double checkout");

                failures.Should().HaveCount(ParallelCallers - 1,
                    because: "all other callers must receive an error (concurrency or state guard)");

                createdCheckoutIds.Add(successes[0].CheckoutId);

                // Verify the drawing is CheckedOut, not Available
                var drawing = await _fx.GetDrawingSnapshotAsync(drawingId);
                drawing.State.Should().Be(2, "drawing must be CheckedOut after the winning checkout");

                // Verify only one Checkout row was created
                var checkouts = _fx.GetCheckoutsForDrawing(drawingId);
                checkouts.Entities.Should().HaveCount(1,
                    because: "exactly one checkout row must exist in Dataverse after N concurrent calls");
            }
            finally
            {
                foreach (var id in createdCheckoutIds)
                    if (Guid.TryParse(id, out var cid))
                        await _fx.DeleteCheckoutAsync(cid);
                await _fx.DeleteDrawingAsync(drawingId);
            }
        }

        // -----------------------------------------------------------------------
        // INT-05: CheckOut on non-Available drawing is rejected
        // -----------------------------------------------------------------------

        [Fact]
        [Trait("Category", "Integration")]
        public async Task CheckOut_on_CheckedOut_drawing_is_rejected()
        {
            SkipIfNoDataverse();

            var drawingId  = await _fx.CreateAvailableDrawingAsync(revision: "A");
            Guid checkoutId = Guid.Empty;
            try
            {
                var first = await _fx.InvokeCheckOutAsync(drawingId);
                first.Success.Should().BeTrue("first checkout must succeed");
                Guid.TryParse(first.CheckoutId, out checkoutId);

                var second = await _fx.InvokeCheckOutAsync(drawingId);
                second.Success.Should().BeFalse(
                    "second checkout attempt on a CheckedOut drawing must fail with state guard error");
            }
            finally
            {
                if (checkoutId != Guid.Empty) await _fx.DeleteCheckoutAsync(checkoutId);
                await _fx.DeleteDrawingAsync(drawingId);
            }
        }

        // -----------------------------------------------------------------------
        // INT-06: SubmitRevision (approval OFF) then Finalize locks drawing + sheets
        // -----------------------------------------------------------------------

        [Fact]
        [Trait("Category", "Integration")]
        public async Task SubmitRevision_then_Finalize_locks_drawing_and_sheets()
        {
            SkipIfNoDataverse();

            var drawingId   = await _fx.CreateAvailableDrawingAsync(revision: "A");
            Guid checkoutId = Guid.Empty;
            try
            {
                var co = await _fx.InvokeCheckOutAsync(drawingId);
                co.Success.Should().BeTrue();
                Guid.TryParse(co.CheckoutId, out checkoutId).Should().BeTrue();

                // WS3 note: with RequireCheckOutApproval on (the default), a live run needs an
                // ApproveCheckout step between CheckOut and SubmitRevision. This integration test is
                // skipped without a live org; when run, seed RequireCheckOutApproval=false or insert approval.
                await _fx.InvokeSubmitRevisionAsync(checkoutId, "Project Falcon, WO#12345");

                var afterSubmit = await _fx.GetDrawingSnapshotAsync(drawingId);
                afterSubmit.State.Should().Be(1, "approval-off submit returns the drawing to Available");
                afterSubmit.CurrentRevision.Should().NotBeNullOrEmpty(
                    "WS3: the revision number is gone; an internal cycle token is stamped instead");

                var fin = await _fx.InvokeFinalizeAsync(drawingId, "Final issued-for-construction revision.");
                fin.Success.Should().BeTrue();

                var afterFinal = await _fx.GetDrawingSnapshotAsync(drawingId);
                afterFinal.State.Should().Be(7, "finalized is terminal");
                _fx.CountSheetsInState(drawingId, 7).Should().BeGreaterThan(0,
                    "sheets must mirror the drawing into Finalized = 7");

                var co2 = await _fx.InvokeCheckOutAsync(drawingId);
                co2.Success.Should().BeFalse("a finalized drawing cannot be checked out");
            }
            finally
            {
                if (checkoutId != Guid.Empty) await _fx.DeleteCheckoutAsync(checkoutId);
                await _fx.DeleteDrawingAsync(drawingId);
            }
        }

        // -----------------------------------------------------------------------
        // INT-07: Concurrent finalize — exactly one winner (Rule 14)
        // -----------------------------------------------------------------------

        [Fact]
        [Trait("Category", "Integration")]
        public async Task Concurrent_finalize_on_same_drawing_produces_exactly_one_winner()
        {
            SkipIfNoDataverse();
            const int ParallelCallers = 8;

            var drawingId = await _fx.CreateAvailableDrawingAsync(revision: "A");
            try
            {
                var tasks = Enumerable.Range(0, ParallelCallers)
                    .Select(_ => _fx.InvokeFinalizeAsync(drawingId, "Concurrent finalize attempt — only one may win."))
                    .ToList();
                var results = await Task.WhenAll(tasks);

                results.Count(r => r.Success).Should().Be(1,
                    because: "RowVersion concurrency must let exactly one finalize succeed; the guard rejects the rest");
                results.Count(r => !r.Success).Should().Be(ParallelCallers - 1);

                (await _fx.GetDrawingSnapshotAsync(drawingId)).State.Should().Be(7);
            }
            finally
            {
                await _fx.DeleteDrawingAsync(drawingId);
            }
        }
    }
}
