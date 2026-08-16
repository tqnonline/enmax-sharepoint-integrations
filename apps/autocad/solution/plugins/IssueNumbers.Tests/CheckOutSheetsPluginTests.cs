using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Linq;
using Xunit;

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class CheckOutSheetsPluginTests
    {
        [Fact]
        public void CheckoutSheets_ImmediatePath_ChecksOutSheetAndRollsUpDrawing()
        {
            var ctx = new XrmFakedContext();
            var userId = Guid.NewGuid();
            var drawingId = Guid.NewGuid();
            var sheetId = Guid.NewGuid();

            ctx.Initialize(new Entity[]
            {
                new Entity("enmax_autocaddrawing", drawingId)
                {
                    ["enmax_acdnstate"] = new OptionSetValue(1),
                    ["ownerid"] = new EntityReference("systemuser", userId),
                },
                new Entity("enmax_autocadsheet", sheetId)
                {
                    ["enmax_acdndrawing"] = new EntityReference("enmax_autocaddrawing", drawingId),
                    ["enmax_acdnstate"] = new OptionSetValue(2),
                    ["ownerid"] = new EntityReference("systemuser", userId),
                    ["enmax_acdnreservationtype"] = new OptionSetValue(1),
                },
                new Entity("enmax_autocadappconfig", Guid.NewGuid())
                {
                    ["enmax_acdnkey"] = "RequireCheckOutApproval",
                    ["enmax_acdnvalue"] = "false",
                },
            });

            var pluginCtx = ctx.GetDefaultPluginContext();
            pluginCtx.MessageName = "enmax_acdnCheckOutSheets";
            pluginCtx.Stage = 40;
            PluginTestUsers.SetInteractiveCaller(ctx, pluginCtx, userId);
            pluginCtx.InputParameters = new ParameterCollection
            {
                ["Sheets"] = new EntityReferenceCollection
                {
                    new EntityReference("enmax_autocadsheet", sheetId),
                },
            };
            pluginCtx.OutputParameters = new ParameterCollection();

            ctx.ExecutePluginWith<CheckOutSheetsPlugin>(pluginCtx);

            var svc = ctx.GetFakedOrganizationService();
            var checkout = svc.RetrieveMultiple(new QueryExpression("enmax_autocadcheckout")
            {
                ColumnSet = new ColumnSet(true),
            }).Entities.Should().ContainSingle().Subject;
            checkout.GetAttributeValue<EntityReference>("enmax_acdnsheet")?.Id.Should().Be(sheetId);
            checkout.GetAttributeValue<OptionSetValue>("enmax_acdnstatus")?.Value.Should().Be(1);

            svc.Retrieve("enmax_autocadsheet", sheetId, new ColumnSet("enmax_acdnstate"))
                .GetAttributeValue<OptionSetValue>("enmax_acdnstate")?.Value.Should().Be(3);
            svc.Retrieve("enmax_autocaddrawing", drawingId, new ColumnSet("enmax_acdnstate"))
                .GetAttributeValue<OptionSetValue>("enmax_acdnstate")?.Value.Should().Be(2);

            var audit = svc.RetrieveMultiple(new QueryExpression("enmax_autocadauditevent")
            {
                ColumnSet = new ColumnSet(true),
            }).Entities.Should().ContainSingle().Subject;
            audit.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be("enmax_autocadsheet");
            audit.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(sheetId.ToString());

            pluginCtx.OutputParameters.Contains("CheckoutIds").Should().BeTrue();
            var output = (string[])pluginCtx.OutputParameters["CheckoutIds"];
            output.Should().HaveCount(1);
            Guid.TryParse(output.First(), out _).Should().BeTrue();
        }
    }
}
