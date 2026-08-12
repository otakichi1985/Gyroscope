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
// driverProvider 'external' (tauri-driver + msedgedriver) was chosen over
// the default 'embedded' provider specifically because 'embedded' requires
// adding tauri-plugin-wdio-webdriver to src-tauri/Cargo.toml and the app's
// Rust entrypoint -- a real product dependency change. 'external' needs no
// Rust/Cargo.toml edits at all; tauri-driver and msedgedriver are managed
// as external, swappable dev tools instead.
export const config = {
  runner: "local",
  specs: ["./specs/**/*.spec.js"],
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
