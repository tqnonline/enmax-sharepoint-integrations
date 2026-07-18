import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify("test"),
    __APP_BUILD_DATE__: JSON.stringify("2026-05-18"),
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Retry timing-sensitive DOM tests (Fluent portals, async form validation)
    // to absorb CI-load races. A genuinely broken test still fails every attempt,
    // so retries stabilize flakiness without masking real regressions.
    retry: 2,
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["node_modules", "dist", "e2e/**"],  // e2e uses Playwright, not Vitest
    server: {
      deps: {
        inline: ["@microsoft/power-apps"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/features/reserve/**",
        "src/features/sharepoint/sharepointUrls.ts",
        "src/config/**",
        "src/lib/drawingTaxonomy.ts",
      ],
      exclude: ["src/generated/**", "**/*.d.ts", "src/__tests__/**"],
      thresholds: {
        lines: 85,
        functions: 80,
        branches: 80,
        statements: 85,
      },
    },
  },
});
