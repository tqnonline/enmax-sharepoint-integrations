using System;
using System.Linq;
using Enmax.AutoCAD;
using FakeXrmEasy;
using FluentAssertions;
using Microsoft.Xrm.Sdk;
using Xunit;

// ReSharper disable InconsistentNaming

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    public class ExceptionEmitterTests
    {
        private static Entity GetFirstException(XrmFakedContext ctx)
            => ctx.CreateQuery("enmax_autocadflowexception").FirstOrDefault() as Entity;

        [Fact]
        public void Log_WritesFlowExceptionRow_WithPluginOriginAndSuppliedFields()
        {
            var ctx           = new XrmFakedContext();
            var service       = ctx.GetOrganizationService();
            var actingUserId  = Guid.NewGuid();
            var subjectId     = Guid.NewGuid();
            var correlationId = Guid.NewGuid();
            var thrown        = new InvalidOperationException("Reservation lookup failed");

            ExceptionEmitter.Log(
                service,
                tracing: null,
                ex: thrown,
                failedAction: "SomePlugin.ExecuteDataversePlugin",
                subjectTable: "enmax_autocadreservation",
                subjectId: subjectId,
                actingUserId: actingUserId,
                correlationId: correlationId);

            var row = GetFirstException(ctx);
            row.Should().NotBeNull("ExceptionEmitter must persist a row even without a plugin context");

            row.GetAttributeValue<OptionSetValue>("enmax_acdnorigin").Value
               .Should().Be(ExceptionEmitter.OriginPlugin, because: "plug-in failures must be logged with origin = Plugin");
            row.GetAttributeValue<OptionSetValue>("enmax_acdnseverity").Value
               .Should().Be(ExceptionEmitter.SeverityError, because: "severity defaults to Error when unspecified");
            row.GetAttributeValue<string>("enmax_acdnerrormessage").Should().Be(thrown.Message);
            row.GetAttributeValue<string>("enmax_acdnerrorcode").Should().Be(nameof(InvalidOperationException));
            row.GetAttributeValue<string>("enmax_acdnerrordetail").Should().Contain(thrown.Message);
            row.GetAttributeValue<string>("enmax_acdnfailedaction").Should().Be("SomePlugin.ExecuteDataversePlugin");
            row.GetAttributeValue<string>("enmax_acdnsubjecttable").Should().Be("enmax_autocadreservation");
            row.GetAttributeValue<string>("enmax_acdnsubjectid").Should().Be(subjectId.ToString());
            row.GetAttributeValue<string>("enmax_acdncorrelationid").Should().Be(correlationId.ToString());
            row.GetAttributeValue<EntityReference>("enmax_acdnactinguser").Id.Should().Be(actingUserId);
            row.GetAttributeValue<string>("enmax_acdnname").Should().Contain("Plugin").And.Contain("SomePlugin.ExecuteDataversePlugin");
        }

        [Fact]
        public void Log_HonoursExplicitSeverityOverride()
        {
            var ctx     = new XrmFakedContext();
            var service = ctx.GetOrganizationService();

            ExceptionEmitter.Log(
                service, tracing: null, ex: new Exception("critical failure"),
                failedAction: "SomePlugin.Execute",
                severity: ExceptionEmitter.SeverityCritical);

            var row = GetFirstException(ctx);
            row.GetAttributeValue<OptionSetValue>("enmax_acdnseverity").Value
               .Should().Be(ExceptionEmitter.SeverityCritical);
        }

        [Fact]
        public void Log_OmitsOptionalFields_WhenNotSupplied()
        {
            var ctx     = new XrmFakedContext();
            var service = ctx.GetOrganizationService();

            ExceptionEmitter.Log(service, tracing: null, ex: new Exception("no context"), failedAction: "Bare.Action");

            var row = GetFirstException(ctx);
            row.Should().NotBeNull();
            row.Contains("enmax_acdnsubjecttable").Should().BeFalse();
            row.Contains("enmax_acdnsubjectid").Should().BeFalse();
            row.Contains("enmax_acdncorrelationid").Should().BeFalse();
            row.Contains("enmax_acdnactinguser").Should().BeFalse();
        }

        [Fact]
        public void Log_NeverThrows_EvenWhenTheServiceCallFails()
        {
            // A null service makes the internal Create() call throw a NullReferenceException;
            // ExceptionEmitter must swallow that and never propagate it to the caller.
            Action act = () => ExceptionEmitter.Log(
                service: null, tracing: null, ex: new Exception("boom"), failedAction: "Never.Throws");

            act.Should().NotThrow(because: "logging a failure must never itself become a failure");
        }

        [Fact]
        public void Log_DoesNothing_WhenExceptionIsNull()
        {
            var ctx     = new XrmFakedContext();
            var service = ctx.GetOrganizationService();

            ExceptionEmitter.Log(service, tracing: null, ex: null, failedAction: "Some.Action");

            GetFirstException(ctx).Should().BeNull("there is nothing to log when no exception was supplied");
        }
    }
}
