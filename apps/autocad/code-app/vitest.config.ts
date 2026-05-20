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
    },
  },
});
