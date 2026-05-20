import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider } from "@fluentui/react-components";
import { enmaxLightTheme } from "./theme/brand";
import { AppConfigGate } from "./app/AppConfigGate";
import { AppLoadingSplash } from "./app/AppLoadingSplash";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { router } from "./routes";
import "./index.css";

const queryClient = new QueryClient({
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
