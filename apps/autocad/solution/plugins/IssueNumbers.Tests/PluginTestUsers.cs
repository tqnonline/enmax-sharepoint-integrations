using FakeXrmEasy;
using Microsoft.Xrm.Sdk;
using System;
using System.Linq;

namespace Enmax.AutoCad.Plugins.IssueNumbers.Tests
{
    internal static class PluginTestUsers
    {
        internal static void SetInteractiveCaller(
            XrmFakedContext context,
            XrmFakedPluginExecutionContext pluginContext,
            Guid userId)
        {
            SeedInteractiveUser(context, userId);
            pluginContext.InitiatingUserId = userId;
        }

        internal static void SeedInteractiveUser(XrmFakedContext context, Guid userId)
        {
            if (userId == Guid.Empty)
                throw new ArgumentException("A test caller must have a non-empty user id.", nameof(userId));

            if (!context.CreateQuery("systemuser").Any(user => user.Id == userId))
            {
                context.GetOrganizationService().Create(new Entity("systemuser", userId)
                {
                    ["fullname"] = "Test User",
                });
            }
        }
    }
}
