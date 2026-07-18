import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { getContext } from "@microsoft/power-apps/app";
import { AppLoadingSplash } from "./AppLoadingSplash";
import { resolveDeepLink } from "../lib/deeplink/deeplinkTargets";

// Reads the launch query parameters the player forwards (authoritatively via
// getContext().app.queryParams, with window.location.search as a fallback for
// local dev / non-player hosts), maps them to an internal route, and redirects
// once. Runs a single getContext round-trip on cold boot; the app always enters
// at the root, so this is the one place an inbound deep link can be honored.
async function readLaunchParams(): Promise<Record<string, string>> {
  let params: Record<string, string> = {};
  try {
    const ctx = await getContext();
    params = { ...(ctx.app.queryParams ?? {}) };
  } catch {
    /* not running in the player (e.g. local dev) — fall back to the URL */
  }
  if (!params.target) {
    try {
      const sp = new URLSearchParams(window.location.search);
      const target = sp.get("target");
      if (target) {
        params = {
          target,
          ...(sp.get("id") ? { id: sp.get("id") as string } : {}),
          ...(sp.get("section") ? { section: sp.get("section") as string } : {}),
          ...(sp.get("tab") ? { tab: sp.get("tab") as string } : {}),
        };
      }
    } catch {
      /* window unavailable — ignore */
    }
  }
  return params;
}

interface DeepLinkBootstrapProps {
  children: ReactNode;
}

export function DeepLinkBootstrap({ children }: DeepLinkBootstrapProps) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard StrictMode double-invoke
    ran.current = true;
    let cancelled = false;
    (async () => {
      try {
        const path = resolveDeepLink(await readLaunchParams());
        if (!cancelled && path) navigate(path, { replace: true });
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!ready) return <AppLoadingSplash />;
  return <>{children}</>;
}
