// Injected at build time via vite.config.ts define block.
// Fallback to package.json version for local dev.
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0-dev";

export const APP_BUILD_DATE: string =
  typeof __APP_BUILD_DATE__ !== "undefined"
    ? __APP_BUILD_DATE__
    : new Date().toISOString().split("T")[0];

declare const __APP_VERSION__: string;
declare const __APP_BUILD_DATE__: string;
