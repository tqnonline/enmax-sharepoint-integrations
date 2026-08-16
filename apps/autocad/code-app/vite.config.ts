import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react(), powerApps()],
  server: { port: 3000 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString().split("T")[0]),
  },
});
