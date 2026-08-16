import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { FluentProvider } from "@fluentui/react-components";
import { enmaxLightTheme } from "./theme/brand";
import { AppConfigGate } from "./app/AppConfigGate";
import { AppLoadingSplash } from "./app/AppLoadingSplash";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { router } from "./routes";
import { isDiagnosticsOn, diagLog, applyDebugQueryParam } from "./lib/diagnostics";
import "./index.css";

// Enable from a ?debug=1 link before anything queries.
applyDebugQueryParam();

const keyName = (key: unknown): string =>
  Array.isArray(key) && key.length > 0 ? String(key[0]) : "query";

// Diagnostics Mode backbone: every read/write flows through this client, so the
// cache handlers are the single place to log all data + integration operations.
// They early-return when the mode is off (zero overhead otherwise).
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onSuccess: (data, query) => {
      if (!isDiagnosticsOn()) return;
      const rows = (data as { rows?: unknown[] })?.rows ?? (Array.isArray(data) ? data : undefined);
      const count = Array.isArray(rows) ? ` (${rows.length} rows)` : "";
      diagLog("read", `${keyName(query.queryKey)}${count}`, { key: query.queryKey, result: data });
    },
    onError: (error, query) => {
      if (!isDiagnosticsOn()) return;
      diagLog("read:error", keyName(query.queryKey), { key: query.queryKey, error });
    },
  }),
  mutationCache: new MutationCache({
    onSuccess: (data, variables, _ctx, mutation) => {
      if (!isDiagnosticsOn()) return;
      diagLog("write", keyName(mutation.options.mutationKey), { key: mutation.options.mutationKey, variables, result: data });
    },
    onError: (error, variables, _ctx, mutation) => {
      if (!isDiagnosticsOn()) return;
      diagLog("write:error", keyName(mutation.options.mutationKey), { key: mutation.options.mutationKey, variables, error });
    },
  }),
  defaultOptions: {
    queries: {
      retry: 3,
      throwOnError: false,
    },
  },
});

// Bootstrap order per plan Step 6:
// 1. FluentProvider with default light theme (safe fallback during config load)
// 2. QueryClientProvider
// 3. AppErrorBoundary (catches ZodError / config fetch failure — fail-loud per Rule 12)
// 4. Suspense → AppConfigGate (suspends until config loaded; re-wraps FluentProvider with config theme)
// 5. RouterProvider
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FluentProvider theme={enmaxLightTheme} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary>
          <Suspense fallback={<AppLoadingSplash />}>
            <AppConfigGate>
              <RouterProvider router={router} />
            </AppConfigGate>
          </Suspense>
        </AppErrorBoundary>
      </QueryClientProvider>
    </FluentProvider>
  </StrictMode>,
);
