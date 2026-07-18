import { Navigate, useSearchParams } from "react-router-dom";
import { resolveDeepLink } from "../lib/deeplink/deeplinkTargets";

// In-app landing route (`#/link?target=...&id=...`). Deep links that reach the
// app via the hash (in-app share, or a manual test) resolve here. The primary
// email path is DeepLinkBootstrap (pre-hash query); this is a testable seam that
// exercises the same resolver without depending on the player's getContext.
export function LinkLanding() {
  const [searchParams] = useSearchParams();
  const path = resolveDeepLink(Object.fromEntries(searchParams.entries()));
  return <Navigate to={path ?? "/"} replace />;
}
