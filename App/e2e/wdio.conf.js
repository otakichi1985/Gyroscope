import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appBinaryPath = path.resolve(
  __dirname,
  "../src-tauri/target/debug/gyroscope.exe",
);

// Minimal WebdriverIO + @wdio/tauri-service harness -- NOT a general E2E
// suite. Exists to let AI/devtools reproduce and observe real-window bugs
// (focus, OS/WebView2 timing) that a plain-browser DevTools session can't
// see, since a hidden/backgrounded browser tab throttles things like
// requestAnimationFrame that the real app depends on.
//
// The external provider keeps the product free of test-only Rust dependencies;
// run-e2e.mjs manages tauri-driver and msedgedriver for the verification run.
export const config = {
  runner: "local",
  specs: ["./specs/**/*.spec.js"],
  // In-session disposable/diagnostic specs (prefixed zz-temp-) are kept for
  // rollback/debug safety but excluded from the default full-suite run so
  // they don't slow every verification. Run them explicitly when needed:
  //   npm run test:e2e -- --spec e2e/specs/zz-temp-<name>.spec.js
  // (run-e2e.mjs sets E2E_INCLUDE_TEMP=1 when a single `--spec` is passed, so
  // that path drops this exclude and the temp spec runs without an extra
  // `--exclude` override.)
  // Discard them at an appropriate later timing (next verification, before a
  // release) rather than immediately after use -- see VERIFY.md.
  exclude: process.env.E2E_INCLUDE_TEMP === "1" ? [] : ["./specs/**/zz-temp-*.spec.js"],
  maxInstances: 1,

  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "external",
        autoInstallTauriDriver: true,
        autoDownloadEdgeDriver: true,
        captureBackendLogs: true,
        captureFrontendLogs: true,
        startTimeout: 60000,
      },
    ],
  ],

  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: appBinaryPath,
      },
    },
  ],

  logLevel: "info",
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 3,

  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 90000,
  },

  reporters: ["spec"],
};
