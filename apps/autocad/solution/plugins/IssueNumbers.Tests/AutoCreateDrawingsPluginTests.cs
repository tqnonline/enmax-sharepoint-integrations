using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Unit tests for AutoCreateDrawingsPlugin.
    /// Trigger: Post-Op Async Update on enmax_autocadreservation, filtering attr = enmax_acdnissuednumbers.
    /// </summary>
    public class AutoCreateDrawingsPluginTests
    {
        private const string ReservationEntity = "enmax_autocadreservation";
        private const string DrawingEntity     = "enmax_autocaddrawing";
        private const string SheetEntity       = "enmax_autocadsheet";

        private const int StatusApproved = 2;
        private const int StatusPending  = 1;

        // ── Helpers ──────────────────────────────────────────────────────────────

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx, Guid reservationId)
            BuildContext(
                int[] numbers,
                int status       = StatusApproved,
                int sheetsPer    = 2,
                bool includeCodes = true,
                int? reservationType = null,
                int? documentSubtype = null)
        {
            var ctx           = new XrmFakedContext();
            var reservationId = Guid.NewGuid();
            var ownerId       = Guid.NewGuid();

            // Lookup entity IDs
            var bizId    = Guid.NewGuid();
            var assetId  = Guid.NewGuid();
            var unitId   = Guid.NewGuid();
            var domainId = Guid.NewGuid();
            var systemId = Guid.NewGuid();
            var kindId   = Guid.NewGuid();

            // Lookup records (code values fetched by BuildSequenceKey)
            if (includeCodes)
            {
                ctx.Initialize(new[]
                {
                    new Entity("enmax_autocadbusiness", bizId)   { ["enmax_acdncode"] = "BIZ" },
                    new Entity("enmax_autocadasset",    assetId) { ["enmax_acdncode"] = "AST" },
                    new Entity("enmax_autocadunit",     unitId)  { ["enmax_acdncode"] = "UNT" },
                    new Entity("enmax_autocaddomain",   domainId){ ["enmax_acdncode"] = "DOM" },
                    new Entity("enmax_autocadsystem",   systemId){ ["enmax_acdncode"] = "SYS" },
                    new Entity("enmax_autocadkind",     kindId)  { ["enmax_acdncode"] = "KND" },
                });
            }

            ctx.GetFakedOrganizationService().Create(new Entity(ReservationEntity, reservationId));

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName        = "Update";
            pluginCtx.Stage              = 40; // PostOperation
            pluginCtx.Mode               = 1;  // Asynchronous
            pluginCtx.PrimaryEntityId    = reservationId;
            pluginCtx.PrimaryEntityName  = ReservationEntity;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, ownerId);
            pluginCtx.InputParameters    = new ParameterCollection();
            pluginCtx.OutputParameters   = new ParameterCollection();

            var post = new Entity(ReservationEntity, reservationId)
            {
                ["enmax_acdnstatus"]          = new OptionSetValue(status),
                ["enmax_acdnissuednumbers"]   = JsonConvert.SerializeObject(numbers),
                ["enmax_acdnsheetsperdrawing"]= sheetsPer,
                ["ownerid"]                  = new EntityReference("systemuser", ownerId),
            };

            if (reservationType.HasValue)
                post["enmax_acdnreservationtype"] = new OptionSetValue(reservationType.Value);
            if (documentSubtype.HasValue)
                post["enmax_acdndocumentsubtype"] = new OptionSetValue(documentSubtype.Value);

            if (includeCodes)
            {
                post["enmax_acdnbusiness"] = new EntityReference("enmax_autocadbusiness", bizId);
                post["enmax_acdnasset"]    = new EntityReference("enmax_autocadasset",    assetId);
                post["enmax_acdnunit"]     = new EntityReference("enmax_autocadunit",     unitId);
                post["enmax_acdndomain"]   = new EntityReference("enmax_autocaddomain",   domainId);
                post["enmax_acdnsystem"]   = new EntityReference("enmax_autocadsystem",   systemId);
                post["enmax_acdnkind"]     = new EntityReference("enmax_autocadkind",     kindId);
            }

            pluginCtx.PostEntityImages = new EntityImageCollection { ["postImage"] = post };

            return (ctx, pluginCtx, reservationId);
        }

        // ── Happy path ───────────────────────────────────────────────────────────

        [Fact]
        public void Execute_CreatesOneDrawingPerIssuedNumber()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1, 2, 3 });

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(DrawingEntity).ToList().Should().HaveCount(3,
                because: "one drawing must be created for every issued number");
        }

        [Fact]
        public void Execute_DrawingNumbers_UseSequenceKeyAndPaddedNumber()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1, 42 });

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            var numbers = ctx.CreateQuery(DrawingEntity)
                .Select(e => e.GetAttributeValue<string>("enmax_acdnnumber"))
                .OrderBy(n => n)
                .ToList();

            numbers.Should().Equal(
                new[] { "BIZ-AST-UNT-DOM-SYS-KND-0001", "BIZ-AST-UNT-DOM-SYS-KND-0042" },
                because: "drawing number must be sequenceKey-NNNN with zero-padded 4-digit sequence number");
        }

        [Fact]
        public void Execute_DrawingState_IsAvailable()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1 });

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            drawing.GetAttributeValue<OptionSetValue>("enmax_acdnstate")?.Value
                .Should().Be(1, because: "newly created drawings must start in Available state");
        }

        [Fact]
        public void Execute_DrawingOwner_SetToReservationOwner()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1 });
            var ownerId = pluginCtx.InitiatingUserId;

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            drawing.GetAttributeValue<EntityReference>("ownerid")?.Id
                .Should().Be(ownerId, because: "drawing owner must match the reservation owner from the post-image");
        }

        [Fact]
        public void Execute_DrawingLinkedToReservation()
        {
            var (ctx, pluginCtx, reservationId) = BuildContext(new[] { 1 });

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            drawing.GetAttributeValue<EntityReference>("enmax_acdnreservation")?.Id
                .Should().Be(reservationId, because: "drawing must reference the triggering reservation");
        }

        [Fact]
        public void Execute_CreatesSheets_PerDrawing()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1, 2 }, sheetsPer: 3);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(SheetEntity).ToList().Should().HaveCount(6,
                because: "2 drawings × 3 sheets = 6 total sheet records");
        }

        [Fact]
        public void Execute_SheetNumbers_AreSequential()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1 }, sheetsPer: 3);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            var sheetNumbers = ctx.CreateQuery(SheetEntity)
                .Select(e => e.GetAttributeValue<int>("enmax_acdnsheetnumber"))
                .OrderBy(n => n)
                .ToList();

            sheetNumbers.Should().Equal(new[] { 1, 2, 3 },
                because: "sheets must be numbered 1..N in order");
        }

        [Fact]
        public void Execute_SheetLinked_ToItsDrawing()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1 }, sheetsPer: 1);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            var sheet   = ctx.CreateQuery(SheetEntity).Single();

            sheet.GetAttributeValue<EntityReference>("enmax_acdndrawing")?.Id
                .Should().Be(drawing.Id, because: "each sheet must reference its parent drawing");
        }

        [Fact]
        public void Execute_DefaultsToOneSheet_WhenSheetsPer_IsZero()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1 }, sheetsPer: 0);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(SheetEntity).ToList().Should().HaveCount(1,
                because: "zero sheetsPer must fall back to 1 sheet per drawing");
        }

        [Fact]
        public void Execute_Taxonomy_CopiedOntoDrawingAndSheet()
        {
            // Document/Procedure (type=2, subtype=2): base + child both self-identifying (ADR 0001).
            var (ctx, pluginCtx, _) = BuildContext(
                new[] { 1 }, sheetsPer: 1, reservationType: 2, documentSubtype: 2);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            var drawing = ctx.CreateQuery(DrawingEntity).Single();
            drawing.GetAttributeValue<OptionSetValue>("enmax_acdnreservationtype")?.Value
                .Should().Be(2, because: "the base record must carry its reservation type");
            drawing.GetAttributeValue<OptionSetValue>("enmax_acdndocumentsubtype")?.Value
                .Should().Be(2, because: "the base record must carry its document subtype");

            var sheet = ctx.CreateQuery(SheetEntity).Single();
            sheet.GetAttributeValue<OptionSetValue>("enmax_acdnreservationtype")?.Value
                .Should().Be(2, because: "the child form/document must carry its reservation type");
            sheet.GetAttributeValue<OptionSetValue>("enmax_acdndocumentsubtype")?.Value
                .Should().Be(2, because: "the child form/document must carry its document subtype");
        }

        // ── Guard: append reservation (target drawing set) ───────────────────────

        [Fact]
        public void Execute_TargetDrawingOnPostImage_SkipsCreation()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1 });
            var targetId = Guid.NewGuid();
            pluginCtx.PostEntityImages["postImage"]["enmax_acdntargetdrawing"] =
                new EntityReference(DrawingEntity, targetId);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(DrawingEntity).ToList().Should().BeEmpty(
                because: "append reservations with a target drawing must not create new base drawings");
        }

        [Fact]
        public void Execute_TargetDrawingOnReservation_SkipsCreation()
        {
            var (ctx, pluginCtx, reservationId) = BuildContext(new[] { 1 });
            var targetId = Guid.NewGuid();
            var service = ctx.GetFakedOrganizationService();
            service.Update(new Entity(ReservationEntity, reservationId)
            {
                ["enmax_acdntargetdrawing"] = new EntityReference(DrawingEntity, targetId),
            });

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(DrawingEntity).ToList().Should().BeEmpty(
                because: "when target drawing is only on the reservation record, plugin must still skip");
        }

        // ── Guard: status not Approved ───────────────────────────────────────────

        [Fact]
        public void Execute_StatusNotApproved_SkipsCreation()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1, 2 }, status: StatusPending);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(DrawingEntity).ToList().Should().BeEmpty(
                because: "drawings must only be created when reservation status is Approved (2)");
        }

        // ── Guard: missing / empty issued numbers ────────────────────────────────

        [Fact]
        public void Execute_NullIssuedNumbers_SkipsCreation()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1 });
            var post = pluginCtx.PostEntityImages["postImage"];
            post["enmax_acdnissuednumbers"] = null;

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(DrawingEntity).ToList().Should().BeEmpty(
                because: "null issuedNumbers must be skipped without error");
        }

        [Fact]
        public void Execute_EmptyIssuedNumbers_SkipsCreation()
        {
            var (ctx, pluginCtx, _) = BuildContext(Array.Empty<int>());

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(DrawingEntity).ToList().Should().BeEmpty(
                because: "empty issuedNumbers array must be treated as a no-op");
        }

        // ── Guard: missing post-image ────────────────────────────────────────────

        [Fact]
        public void Execute_MissingPostImage_SkipsCreation()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1 });
            pluginCtx.PostEntityImages.Clear();

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(DrawingEntity).ToList().Should().BeEmpty(
                because: "if step is mis-registered with no post-image, plugin must silently skip rather than throw");
        }

        // ── Guard: composition fields missing (sequence key cannot be built) ─────

        [Fact]
        public void Execute_MissingCompositionFields_SkipsCreation()
        {
            var (ctx, pluginCtx, _) = BuildContext(new[] { 1 }, includeCodes: false);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            ctx.CreateQuery(DrawingEntity).ToList().Should().BeEmpty(
                because: "if any composition lookup is null, sequence key cannot be built and no drawings should be created");
        }

        // ── Guard: idempotency ───────────────────────────────────────────────────

        [Fact]
        public void Execute_DrawingsAlreadyExist_SkipsCreation()
        {
            var (ctx, pluginCtx, reservationId) = BuildContext(new[] { 1, 2 });

            // Pre-create a drawing via service (Initialize can only be called once per XrmFakedContext)
            var service = ctx.GetFakedOrganizationService();
            service.Create(new Entity(DrawingEntity)
            {
                ["enmax_acdnreservation"] = new EntityReference(ReservationEntity, reservationId),
            });

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            // Still only 1 drawing (the pre-existing one), not 3
            ctx.CreateQuery(DrawingEntity).ToList().Should().HaveCount(1,
                because: "if drawings already exist for the reservation the plugin must skip to prevent duplicate creation");
        }

        // ── Audit events ─────────────────────────────────────────────────────────

        [Fact]
        public void Each_created_drawing_gets_a_Created_audit_event_keyed_to_the_drawing()
        {
            var (ctx, pluginCtx, _) = BuildContext(numbers: new[] { 1, 2 }, sheetsPer: 1);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            var svc    = ctx.GetFakedOrganizationService();
            var audits = svc.RetrieveMultiple(new QueryExpression("enmax_autocadauditevent") { ColumnSet = new ColumnSet(true) });

            audits.Entities.Should().HaveCount(4, because: "one Allocated audit per drawing and per sheet");
            audits.Entities.Should().OnlyContain(a => a.GetAttributeValue<OptionSetValue>("enmax_acdnevent").Value == 1,
                because: "event type 1 = Created");
            audits.Entities.Should().OnlyContain(a => a.GetAttributeValue<string>("enmax_acdntostate") == "Allocated",
                because: "issuance is recorded as Allocated in the lifecycle");

            var drawings   = svc.RetrieveMultiple(new QueryExpression("enmax_autocaddrawing") { ColumnSet = new ColumnSet("enmax_autocaddrawingid") });
            var drawingIds = new HashSet<string>(drawings.Entities.Select(d => d.Id.ToString()));
            audits.Entities.Where(a => a.GetAttributeValue<string>("enmax_acdnsubjecttable") == "enmax_autocaddrawing")
                .Should().OnlyContain(a => drawingIds.Contains(a.GetAttributeValue<string>("enmax_acdnsubjectid")),
                because: "each drawing audit subjectid must be a real drawing id");
        }

        [Fact]
        public void Created_sheets_start_in_sheet_Available_state()
        {
            var (ctx, pluginCtx, _) = BuildContext(numbers: new[] { 1 }, sheetsPer: 2);

            ctx.ExecutePluginWith<AutoCreateDrawingsPlugin>(pluginCtx);

            var sheets = ctx.GetFakedOrganizationService()
                .RetrieveMultiple(new QueryExpression("enmax_autocadsheet") { ColumnSet = new ColumnSet("enmax_acdnstate") });
            sheets.Entities.Should().HaveCount(2);
            sheets.Entities.Should().OnlyContain(s => s.GetAttributeValue<OptionSetValue>("enmax_acdnstate").Value == 2,
                because: "sheet Available = 2 mirrors the drawing's Available = 1");
        }
    }
}
