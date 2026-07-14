using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Linq;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    /// <summary>
    /// Unit tests for CreateSharePointImportStubPlugin (WS5 destination-side orphans).
    /// Custom API: enmax_acdnCreateSharePointImportStub (unbound)
    /// </summary>
    public class CreateSharePointImportStubPluginTests
    {
        private const string DrawingEntity = "enmax_autocaddrawing";
        private const string SheetEntity   = "enmax_autocadsheet";

        private const string ColNumber              = "enmax_acdnnumber";
        private const string ColDrawingState        = "enmax_acdnstate";
        private const string ColReservationType     = "enmax_acdnreservationtype";
        private const string ColDocumentSubtype     = "enmax_acdndocumentsubtype";
        private const string ColSpImportSourceUrl   = "enmax_acdnspimportsourceurl";
        private const string ColSpImportMetadata    = "enmax_acdnspimportmetadata";
        private const string ColDestinationUrl      = "enmax_acdnspdestinationurl";
        private const string ColPresentInDest       = "enmax_acdnpresentindestination";

        private const string ColSheetDrawing = "enmax_acdndrawing";
        private const string ColSheetNumber  = "enmax_acdnsheetnumber";

        private const int StatePendingImport = 8;
        private const int ReservationTypeDrawing  = 1;
        private const int ReservationTypeDocument = 2;
        private const int DocumentSubtypeStandard = 1;
        private const int DocumentSubtypeProcedure = 2;
        private const int DocumentSubtypeForm      = 3;

        private const string BaseNumber  = "GG-CG-00-ECS-AST-DD-0007";
        private const string ChildNumber = BaseNumber + "-001";

        private static (XrmFakedContext ctx, XrmFakedPluginExecutionContext pluginCtx) BuildContext(
            string fileName, string fileUrl, string taxonomy, string metadataJson = null, string recordTypeSp = null)
        {
            var ctx = new XrmFakedContext();
            ctx.Initialize(Enumerable.Empty<Entity>());

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName = "enmax_acdnCreateSharePointImportStub";
            pluginCtx.InputParameters["FileName"] = fileName;
            pluginCtx.InputParameters["FileUrl"]  = fileUrl;
            pluginCtx.InputParameters["Taxonomy"] = taxonomy;
            if (metadataJson != null) pluginCtx.InputParameters["MetadataJson"] = metadataJson;
            if (recordTypeSp != null) pluginCtx.InputParameters["RecordTypeSp"] = recordTypeSp;

            return (ctx, pluginCtx);
        }

        [Fact]
        public void Standard_creates_parent_with_destination_on_drawing_itself()
        {
            var fileUrl = "https://enmaxcorp.sharepoint.com/sites/Documents/Destination/" + BaseNumber + ".pdf";
            var (ctx, pluginCtx) = BuildContext(BaseNumber + ".pdf", fileUrl, "Standard");

            ctx.ExecutePluginWith<CreateSharePointImportStubPlugin>(pluginCtx);

            var svc = ctx.GetFakedOrganizationService();
            var drawing = svc.RetrieveMultiple(new QueryExpression(DrawingEntity) { ColumnSet = new ColumnSet(true) })
                .Entities.Should().ContainSingle().Subject;

            drawing.GetAttributeValue<string>(ColNumber).Should().Be(BaseNumber);
            drawing.GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StatePendingImport,
                because: "an imported stub must never land as Available");
            drawing.GetAttributeValue<OptionSetValue>(ColReservationType).Value.Should().Be(ReservationTypeDocument);
            drawing.GetAttributeValue<OptionSetValue>(ColDocumentSubtype).Value.Should().Be(DocumentSubtypeStandard);
            drawing.GetAttributeValue<string>(ColSpImportSourceUrl).Should().Be(fileUrl);
            drawing.GetAttributeValue<string>(ColDestinationUrl).Should().Be(fileUrl,
                because: "Standard documents are base-only — the destination link lives on the parent");
            drawing.GetAttributeValue<bool>(ColPresentInDest).Should().BeTrue();

            svc.RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet(false) })
                .Entities.Should().BeEmpty(because: "Standard documents never take child sheets");

            pluginCtx.OutputParameters["DrawingId"].Should().Be(drawing.Id.ToString());
            pluginCtx.OutputParameters["SheetId"].Should().Be(string.Empty);
            pluginCtx.OutputParameters["RecordNumber"].Should().Be(BaseNumber);
            pluginCtx.OutputParameters["Created"].Should().Be(true);
        }

        [Fact]
        public void Drawing_child_number_creates_parent_and_linked_sheet()
        {
            var fileUrl = "https://enmaxcorp.sharepoint.com/sites/Drawings/Destination/" + ChildNumber + ".pdf";
            var (ctx, pluginCtx) = BuildContext(ChildNumber + ".pdf", fileUrl, "Drawing");

            ctx.ExecutePluginWith<CreateSharePointImportStubPlugin>(pluginCtx);

            var svc = ctx.GetFakedOrganizationService();
            var drawing = svc.RetrieveMultiple(new QueryExpression(DrawingEntity) { ColumnSet = new ColumnSet(true) })
                .Entities.Should().ContainSingle().Subject;
            drawing.GetAttributeValue<string>(ColNumber).Should().Be(BaseNumber,
                because: "the parent must be the base number with the -ddd sheet suffix stripped");
            drawing.GetAttributeValue<OptionSetValue>(ColDrawingState).Value.Should().Be(StatePendingImport);
            drawing.GetAttributeValue<OptionSetValue>(ColReservationType).Value.Should().Be(ReservationTypeDrawing);
            drawing.GetAttributeValue<string>(ColSpImportSourceUrl).Should().Be(fileUrl);

            var sheet = svc.RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet(true) })
                .Entities.Should().ContainSingle().Subject;
            sheet.GetAttributeValue<EntityReference>(ColSheetDrawing).Id.Should().Be(drawing.Id);
            sheet.GetAttributeValue<int>(ColSheetNumber).Should().Be(1);
            sheet.GetAttributeValue<string>(ColDestinationUrl).Should().Be(fileUrl);
            sheet.GetAttributeValue<bool>(ColPresentInDest).Should().BeTrue();

            drawing.GetAttributeValue<string>(ColDestinationUrl).Should().BeNull(
                because: "a child number's destination link lives on the sheet, not the parent");

            pluginCtx.OutputParameters["SheetId"].Should().Be(sheet.Id.ToString());
            pluginCtx.OutputParameters["RecordNumber"].Should().Be(ChildNumber);
            pluginCtx.OutputParameters["Created"].Should().Be(true);
        }

        [Fact]
        public void Second_sheet_for_same_drawing_reuses_the_existing_parent()
        {
            var firstUrl  = "https://enmaxcorp.sharepoint.com/sites/Drawings/Destination/" + BaseNumber + "-001.pdf";
            var secondUrl = "https://enmaxcorp.sharepoint.com/sites/Drawings/Destination/" + BaseNumber + "-002.pdf";

            var (ctx, pluginCtx1) = BuildContext(BaseNumber + "-001.pdf", firstUrl, "Drawing");
            ctx.ExecutePluginWith<CreateSharePointImportStubPlugin>(pluginCtx1);

            var pluginCtx2 = ctx.GetDefaultPluginContext();
            pluginCtx2.MessageName = "enmax_acdnCreateSharePointImportStub";
            pluginCtx2.InputParameters["FileName"] = BaseNumber + "-002.pdf";
            pluginCtx2.InputParameters["FileUrl"]  = secondUrl;
            pluginCtx2.InputParameters["Taxonomy"] = "Drawing";
            ctx.ExecutePluginWith<CreateSharePointImportStubPlugin>(pluginCtx2);

            var svc = ctx.GetFakedOrganizationService();
            svc.RetrieveMultiple(new QueryExpression(DrawingEntity) { ColumnSet = new ColumnSet(false) })
                .Entities.Should().ContainSingle(because: "both sheets belong to the same parent drawing");
            svc.RetrieveMultiple(new QueryExpression(SheetEntity) { ColumnSet = new ColumnSet(false) })
                .Entities.Should().HaveCount(2);

            pluginCtx1.OutputParameters["DrawingId"].Should().Be(pluginCtx2.OutputParameters["DrawingId"]);
        }

        [Fact]
        public void Identical_FileUrl_rerun_is_idempotent()
        {
            var fileUrl = "https://enmaxcorp.sharepoint.com/sites/Documents/Destination/" + BaseNumber + ".pdf";
            var (ctx, pluginCtx1) = BuildContext(BaseNumber + ".pdf", fileUrl, "Procedure");
            ctx.ExecutePluginWith<CreateSharePointImportStubPlugin>(pluginCtx1);

            var pluginCtx2 = ctx.GetDefaultPluginContext();
            pluginCtx2.MessageName = "enmax_acdnCreateSharePointImportStub";
            pluginCtx2.InputParameters["FileName"] = BaseNumber + ".pdf";
            pluginCtx2.InputParameters["FileUrl"]  = fileUrl;
            pluginCtx2.InputParameters["Taxonomy"] = "Procedure";
            ctx.ExecutePluginWith<CreateSharePointImportStubPlugin>(pluginCtx2);

            var svc = ctx.GetFakedOrganizationService();
            svc.RetrieveMultiple(new QueryExpression(DrawingEntity) { ColumnSet = new ColumnSet(false) })
                .Entities.Should().ContainSingle(because: "re-scanning the same file must not create a duplicate stub");

            pluginCtx2.OutputParameters["Created"].Should().Be(false);
            pluginCtx2.OutputParameters["DrawingId"].Should().Be(pluginCtx1.OutputParameters["DrawingId"]);
        }

        [Fact]
        public void Form_uses_document_subtype_form()
        {
            var fileUrl = "https://enmaxcorp.sharepoint.com/sites/Documents/Destination/" + BaseNumber + ".pdf";
            var (ctx, pluginCtx) = BuildContext(BaseNumber + ".pdf", fileUrl, "Form");
            ctx.ExecutePluginWith<CreateSharePointImportStubPlugin>(pluginCtx);

            var svc = ctx.GetFakedOrganizationService();
            var drawing = svc.RetrieveMultiple(new QueryExpression(DrawingEntity) { ColumnSet = new ColumnSet(true) })
                .Entities.Should().ContainSingle().Subject;
            drawing.GetAttributeValue<OptionSetValue>(ColReservationType).Value.Should().Be(ReservationTypeDocument);
            drawing.GetAttributeValue<OptionSetValue>(ColDocumentSubtype).Value.Should().Be(DocumentSubtypeForm);
        }

        [Fact]
        public void Invalid_taxonomy_throws()
        {
            var (ctx, pluginCtx) = BuildContext(BaseNumber + ".pdf", "https://x/y.pdf", "Blueprint");
            Action act = () => ctx.ExecutePluginWith<CreateSharePointImportStubPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*Taxonomy*");
        }

        [Fact]
        public void FileName_without_pdf_extension_throws()
        {
            var (ctx, pluginCtx) = BuildContext(BaseNumber + ".dwg", "https://x/y.dwg", "Drawing");
            Action act = () => ctx.ExecutePluginWith<CreateSharePointImportStubPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*.pdf*");
        }

        [Fact]
        public void Missing_FileUrl_throws()
        {
            var (ctx, pluginCtx) = BuildContext(BaseNumber + ".pdf", "https://x/y.pdf", "Drawing");
            pluginCtx.InputParameters.Remove("FileUrl");
            Action act = () => ctx.ExecutePluginWith<CreateSharePointImportStubPlugin>(pluginCtx);
            act.Should().Throw<InvalidPluginExecutionException>().WithMessage("*FileUrl*");
        }
    }
}
