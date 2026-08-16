using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class AddChildItemsPluginTests
    {
        private const string ReservationEntity = "enmax_autocadreservation";
        private const string DrawingEntity      = "enmax_autocaddrawing";
        private const string SheetEntity        = "enmax_autocadsheet";
        private const string ColSheetNumber     = "enmax_acdnsheetnumber";
        private const string ColDrawing         = "enmax_acdndrawing";

        private static readonly Guid ApproverTeamId = Guid.NewGuid();
        private static readonly Guid AdminTeamId     = Guid.NewGuid();

        // ── Helpers ────────────────────────────────────────────────────────────

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid drawingId, Guid ownerId)
            BuildContext(
                int count,
                int[] existingSheets = null,
                string baseNumber = "GG-CG-00-ECS-AST-DD-0007",
                (int type, int subtype)? reservationTypeSubtype = null)
        {
            var ctx        = new XrmFakedContext();
            var drawingId  = Guid.NewGuid();
            var ownerId    = Guid.NewGuid();

            var seed = new List<Entity>();

            var drawing = new Entity(DrawingEntity, drawingId)
            {
                ["enmax_acdnnumber"] = baseNumber,
                ["ownerid"]          = new EntityReference("systemuser", ownerId),
            };

            // A reservation link is only needed to exercise the base-only Standard guard.
            if (reservationTypeSubtype.HasValue)
            {
                var reservationId = Guid.NewGuid();
                drawing["enmax_acdnreservation"] = new EntityReference(ReservationEntity, reservationId);
                seed.Add(new Entity(ReservationEntity, reservationId)
                {
                    ["enmax_acdnreservationtype"] = new OptionSetValue(reservationTypeSubtype.Value.type),
                    ["enmax_acdndocumentsubtype"] = new OptionSetValue(reservationTypeSubtype.Value.subtype),
                });
            }

            seed.Add(drawing);

            if (existingSheets != null)
            {
                foreach (var n in existingSheets)
                {
                    seed.Add(new Entity(SheetEntity, Guid.NewGuid())
                    {
                        [ColDrawing]     = new EntityReference(DrawingEntity, drawingId),
                        [ColSheetNumber] = n,
                    });
                }
            }

            // Seed authz so the Approver gate passes for ownerId (the initiating user).
            seed.Add(new Entity("enmax_autocadappconfig", Guid.NewGuid())
            {
                ["enmax_acdnkey"]   = "AdminTeamId",
                ["enmax_acdnvalue"] = AdminTeamId.ToString(),
            });
            seed.Add(new Entity("enmax_autocadappconfig", Guid.NewGuid())
            {
                ["enmax_acdnkey"]   = "ApproverTeamId",
                ["enmax_acdnvalue"] = ApproverTeamId.ToString(),
            });
            seed.Add(new Entity("teammembership", Guid.NewGuid())
            {
                ["teamid"]       = ApproverTeamId,
                ["systemuserid"] = ownerId,
            });

            ctx.Initialize(seed);

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnAddChildItems";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, ownerId);
            pluginCtx.InputParameters  = new ParameterCollection
            {
                ["Drawing"] = new EntityReference(DrawingEntity, drawingId),
                ["Count"]   = count,
            };
            pluginCtx.OutputParameters = new ParameterCollection();

            return (ctx, pluginCtx, drawingId, ownerId);
        }

        private static List<int> SheetNumbers(XrmFakedContext ctx, Guid drawingId) =>
            ctx.CreateQuery(SheetEntity)
               .ToList()
               .Where(e => e.GetAttributeValue<EntityReference>(ColDrawing)?.Id == drawingId)
               .Select(e => e.GetAttributeValue<int>(ColSheetNumber))
               .OrderBy(n => n)
               .ToList();

        // ── Happy path ───────────────────────────────────────────────────────────

        [Fact]
        public void Execute_AppendsChildren_ContinuingFromLastExisting()
        {
            var (ctx, pluginCtx, drawingId, _) = BuildContext(count: 2, existingSheets: new[] { 1, 2, 3 });

            ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);

            SheetNumbers(ctx, drawingId).Should().Equal(1, 2, 3, 4, 5);
        }

        [Fact]
        public void Execute_AppendsFromOne_WhenNoExistingChildren()
        {
            var (ctx, pluginCtx, drawingId, _) = BuildContext(count: 3, existingSheets: null);

            ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);

            SheetNumbers(ctx, drawingId).Should().Equal(1, 2, 3);
        }

        [Fact]
        public void Execute_Output_ReportsRangeAndBaseNumber()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(count: 2, existingSheets: new[] { 1, 2, 3 },
                baseNumber: "GG-CG-00-ECS-AST-DD-0007");

            ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);

            pluginCtx.OutputParameters["ChildrenCreated"].Should().Be(2);
            pluginCtx.OutputParameters["FirstChildNumber"].Should().Be(4);
            pluginCtx.OutputParameters["LastChildNumber"].Should().Be(5);
            pluginCtx.OutputParameters["BaseNumber"].Should().Be("GG-CG-00-ECS-AST-DD-0007");
        }

        [Fact]
        public void Execute_NewChildren_OwnedByDrawingOwner()
        {
            var (ctx, pluginCtx, drawingId, ownerId) = BuildContext(count: 1);

            ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);

            var sheet = ctx.CreateQuery(SheetEntity).Single();
            sheet.GetAttributeValue<EntityReference>("ownerid")?.Id.Should().Be(ownerId);
            sheet.GetAttributeValue<EntityReference>(ColDrawing)?.Id.Should().Be(drawingId);
        }

        [Fact]
        public void Execute_NewChildren_StartInAvailableState()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(count: 1);

            ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);

            var sheet = ctx.CreateQuery(SheetEntity).Single();
            sheet.GetAttributeValue<OptionSetValue>("enmax_acdnstate")?.Value.Should().Be(2,
                because: "new child sheets must be stamped as sheet Available");
        }

        [Fact]
        public void Execute_AllowsDrawingReservation_GuardDoesNotBlock()
        {
            // Legacy Drawing reservation (type=1, subtype unset) — the base-only guard must not trip.
            var (ctx, pluginCtx, drawingId, _) = BuildContext(count: 2,
                reservationTypeSubtype: (1, 0));

            ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);

            SheetNumbers(ctx, drawingId).Should().Equal(1, 2);
        }

        [Fact]
        public void Execute_AllowsDrawingSubtype_GuardDoesNotBlock()
        {
            // Drawing/Drawing (type=1, subtype=2) — numbered children, guard must not trip.
            var (ctx, pluginCtx, drawingId, _) = BuildContext(count: 2,
                reservationTypeSubtype: (
                    TaxonomyConstants.ReservationType.Drawing,
                    TaxonomyConstants.DocumentSubtype.Drawing));

            ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);

            SheetNumbers(ctx, drawingId).Should().Equal(1, 2);
        }

        [Fact]
        public void Execute_AllowsFormDocument_GuardDoesNotBlock()
        {
            // Document/Form (type=2, subtype=5) — numbered children, guard must not trip.
            var (ctx, pluginCtx, drawingId, _) = BuildContext(count: 2,
                reservationTypeSubtype: (
                    TaxonomyConstants.ReservationType.Document,
                    TaxonomyConstants.DocumentSubtype.Form));

            ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);

            SheetNumbers(ctx, drawingId).Should().Equal(1, 2);
        }

        // ── Golden: 3-digit child suffix, continuing the sequence ────────────────

        [Fact]
        public void Golden_DerivedChildNumbers_UseThreeDigitSuffix_ContinuingSequence()
        {
            const string baseNumber = "GG-CG-00-ECS-AST-DD-0007";
            var (ctx, pluginCtx, drawingId, _) = BuildContext(count: 2, existingSheets: new[] { 1, 2, 3 },
                baseNumber: baseNumber);

            ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);

            var derived = SheetNumbers(ctx, drawingId)
                .Select(n => $"{baseNumber}-{n:D3}")
                .ToList();

            derived.Should().Equal(
                $"{baseNumber}-001",
                $"{baseNumber}-002",
                $"{baseNumber}-003",
                $"{baseNumber}-004",
                $"{baseNumber}-005");
        }

        // ── Cap ──────────────────────────────────────────────────────────────────

        [Fact]
        public void Execute_WouldExceed999_Throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(count: 2, existingSheets: new[] { 998 });

            Action act = () => ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*exceed*");
        }

        [Fact]
        public void Execute_ExactlyReaches999_Succeeds()
        {
            var (ctx, pluginCtx, drawingId, _) = BuildContext(count: 1, existingSheets: new[] { 998 });

            ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);

            SheetNumbers(ctx, drawingId).Should().Equal(998, 999);
        }

        // ── Guard cases ────────────────────────────────────────────────────────

        [Fact]
        public void Execute_MissingDrawing_Throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(count: 1);
            pluginCtx.InputParameters.Remove("Drawing");

            Action act = () => ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*Drawing*");
        }

        [Fact]
        public void Execute_WrongEntityDrawing_Throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(count: 1);
            pluginCtx.InputParameters["Drawing"] = new EntityReference("wrong_entity", Guid.NewGuid());

            Action act = () => ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*enmax_autocaddrawing*");
        }

        [Fact]
        public void Execute_MissingCount_Throws()
        {
            var (ctx, pluginCtx, _, _) = BuildContext(count: 1);
            pluginCtx.InputParameters.Remove("Count");

            Action act = () => ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*Count*");
        }

        [Theory]
        [InlineData(0)]
        [InlineData(-1)]
        [InlineData(1000)]
        public void Execute_CountOutOfRange_Throws(int count)
        {
            var (ctx, pluginCtx, _, _) = BuildContext(count: count);

            Action act = () => ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*between 1 and 999*");
        }

        [Fact]
        public void Execute_StandardReservation_Rejected()
        {
            // Document/Standard (type=2, subtype=3) is base-only.
            var (ctx, pluginCtx, _, _) = BuildContext(count: 1, reservationTypeSubtype: (
                TaxonomyConstants.ReservationType.Document,
                TaxonomyConstants.DocumentSubtype.Standard));

            Action act = () => ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*base-only*");
        }

        [Fact]
        public void Execute_AllowsProcedureHost_ForFormChildren()
        {
            // Document/Procedure hosts Form appends (Form is Existing-only).
            var (ctx, pluginCtx, drawingId, _) = BuildContext(count: 2, reservationTypeSubtype: (
                TaxonomyConstants.ReservationType.Document,
                TaxonomyConstants.DocumentSubtype.Procedure));

            ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);

            SheetNumbers(ctx, drawingId).Should().Equal(1, 2);
        }

        [Fact]
        public void Execute_DrawingDocumentReservation_Rejected()
        {
            // Drawing/DrawingDocument (type=1, subtype=1) is base-only.
            var (ctx, pluginCtx, _, _) = BuildContext(count: 1, reservationTypeSubtype: (
                TaxonomyConstants.ReservationType.Drawing,
                TaxonomyConstants.DocumentSubtype.DrawingDocument));

            Action act = () => ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*base-only*");
        }

        [Fact]
        public void UnauthorizedUser_cannot_add_children_and_none_created()
        {
            var ctx       = new XrmFakedContext();
            var drawingId = Guid.NewGuid();
            var plainUser = Guid.NewGuid();

            ctx.Initialize(new[]
            {
                new Entity(DrawingEntity, drawingId)
                {
                    ["enmax_acdnnumber"] = "GG-CG-00-ECS-AST-DD-0007",
                    ["ownerid"]          = new EntityReference("systemuser", plainUser),
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "AdminTeamId",
                    ["enmax_acdnvalue"] = AdminTeamId.ToString(),
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"]   = "ApproverTeamId",
                    ["enmax_acdnvalue"] = ApproverTeamId.ToString(),
                },
                // No teammembership for plainUser
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName      = "enmax_acdnAddChildItems";
            pluginCtx.Stage            = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, plainUser);
            pluginCtx.InputParameters  = new ParameterCollection
            {
                ["Drawing"] = new EntityReference(DrawingEntity, drawingId),
                ["Count"]   = 2,
            };
            pluginCtx.OutputParameters = new ParameterCollection();

            Action act = () => ctx.ExecutePluginWith<AddChildItemsPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>()
               .WithMessage("*not authorized*", because: "callers outside Admin/Approver teams must be denied");

            ctx.CreateQuery(SheetEntity).ToList().Should().BeEmpty();
        }

        // Concurrency note (not unit-tested here): the plug-in performs no try/catch,
        // and PluginBase re-throws any OrganizationServiceFault as
        // InvalidPluginExecutionException — so an alt-key DuplicateDetected from a
        // racing add propagates and the caller retries. This is a real-Dataverse
        // behavior (the enmax_acdnsheet_drawing_num_ak alt key); FakeXrmEasy v1.x does
        // not route service.Create through registered CreateRequest executors, so it
        // cannot be simulated in-memory. The real concurrency guarantee is exercised by
        // the [Category=Integration] Dataverse tests (see IssueNumbersConcurrencyTests).
    }
}
