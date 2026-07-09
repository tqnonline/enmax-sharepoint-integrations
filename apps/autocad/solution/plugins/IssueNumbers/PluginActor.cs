using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

namespace Enmax.AutoCAD
{
    /// <summary>
    /// Resolves the human operator for custom API and plugin actions.
    /// Power Apps Code invokes Dataverse through an application/service identity, so
    /// InitiatingUserId is often SYSTEM or an application user — not the person in the UI.
    /// The Code App passes WhoAmI UserId as optional input parameter ActingUserId.
    /// </summary>
    public static class PluginActor
    {
        public const string InputName = "ActingUserId";

        /// <summary>
        /// Returns the signed-in interactive user for this action.
        /// Prefers ActingUserId when the platform caller is SYSTEM or an application user.
        /// </summary>
        /// <param name="requireActingUserIdForPlatformCaller">
        /// When true (custom API actions from the Code App), a platform caller must supply ActingUserId.
        /// When false (entity pipeline plugins), falls back to InitiatingUserId to avoid breaking Create/Update.
        /// </param>
        public static Guid Resolve(
            IPluginExecutionContext context,
            IOrganizationService systemSvc,
            bool requireActingUserIdForPlatformCaller = false)
        {
            if (context == null)
                throw new InvalidPluginExecutionException(nameof(context));
            if (systemSvc == null)
                throw new InvalidPluginExecutionException(nameof(systemSvc));

            var initiating = context.InitiatingUserId;
            Guid fromInput;
            bool hasInput = TryGetActingUserId(context, out fromInput);

            if (hasInput)
            {
                ValidateInteractiveUser(systemSvc, fromInput);
                if (!IsPlatformIdentity(systemSvc, initiating) && initiating != fromInput)
                {
                    throw new InvalidPluginExecutionException(
                        "ActingUserId does not match the authenticated caller.");
                }
                return fromInput;
            }

            if (IsPlatformIdentity(systemSvc, initiating))
            {
                if (requireActingUserIdForPlatformCaller)
                {
                    throw new InvalidPluginExecutionException(
                        "Missing ActingUserId. The Code App must pass the signed-in user's id on custom API calls.");
                }
                return initiating;
            }

            return initiating;
        }

        /// <summary>Strict resolve for custom API plug-ins invoked from the Code App.</summary>
        public static Guid ResolveForCustomApi(IPluginExecutionContext context, IOrganizationService systemSvc)
            => Resolve(context, systemSvc, requireActingUserIdForPlatformCaller: true);

        private static bool TryGetActingUserId(IPluginExecutionContext context, out Guid userId)
        {
            userId = Guid.Empty;
            if (!context.InputParameters.Contains(InputName))
                return false;

            var raw = context.InputParameters[InputName];
            if (raw == null)
                return false;

            if (raw is Guid g)
            {
                userId = g;
                return userId != Guid.Empty;
            }

            var text = raw as string;
            if (string.IsNullOrWhiteSpace(text))
                return false;

            return Guid.TryParse(text.Trim(), out userId) && userId != Guid.Empty;
        }

        private static bool IsPlatformIdentity(IOrganizationService systemSvc, Guid userId)
        {
            if (userId == Guid.Empty)
                return true;

            try
            {
                var user = systemSvc.Retrieve("systemuser", userId, new ColumnSet("applicationid"));
                return user.Contains("applicationid") && user["applicationid"] != null;
            }
            catch
            {
                // Unknown id — treat as platform so callers must supply ActingUserId.
                return true;
            }
        }

        private static void ValidateInteractiveUser(IOrganizationService systemSvc, Guid userId)
        {
            if (userId == Guid.Empty)
                throw new InvalidPluginExecutionException("ActingUserId must be a non-empty GUID.");

            Entity user;
            try
            {
                user = systemSvc.Retrieve("systemuser", userId, new ColumnSet("applicationid", "isdisabled"));
            }
            catch (Exception ex)
            {
                throw new InvalidPluginExecutionException($"ActingUserId {userId} is not a valid system user.", ex);
            }

            if (user.Contains("applicationid") && user["applicationid"] != null)
                throw new InvalidPluginExecutionException("ActingUserId must be an interactive user, not an application identity.");

            if (user.GetAttributeValue<bool?>("isdisabled") == true)
                throw new InvalidPluginExecutionException("ActingUserId refers to a disabled user.");
        }
    }
}
