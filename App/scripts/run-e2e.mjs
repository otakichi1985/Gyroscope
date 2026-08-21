// Wraps `wdio run e2e/wdio.conf.js`, cleaning up its driver processes both
// before and after -- unlike npm's pre/post script hooks, this always runs
// the after-cleanup even when wdio exits non-zero (a failing spec, a
// crashed run), which is exactly when a driver is most likely to be left
// behind.
//
// It also manages the Vite dev server the debug binary loads from
// (tauri.conf.json `build.devUrl` = http://localhost:1420): the E2E app
// window is useless (it shows a WebView "ERR_CONNECTION_REFUSED" page) if
// that URL isn't serving, and that failure mode is indistinguishable from
// a real UI bug -- it once cost a whole investigation session. So this
// script starts vite itself when nothing is already serving the app on
// port 1420, waits until it responds, and kills the instance it started
// afterwards. If a dev server (e.g. a running `npm run dev`) is already
// serving the app, it is reused and left untouched.
//
// Why cleanup is needed at all: @wdio/tauri-service's 'external' driver
// provider (see e2e/wdio.conf.js's own note on why 'external' over
// 'embedded') spawns tauri-driver.exe and msedgedriver.exe as separate
// child processes, which don't reliably die with the parent on an abnormal
// end (Ctrl+C, a crashed spec). VERIFY.md used to list this as a standing
// limitation of the E2E preset ("都度後片付けが必要"), which discouraged
// reaching for it outside deliberate deep-dive debugging -- the point of
// this wrapper is to remove that friction so it's the default way to run
// this suite, not a special-occasion one.
//
// Deliberately unconditional by process name (unlike dev-clean.mjs's
// careful "only this checkout's build" check for gyroscope.exe): nothing
// else on a dev machine is plausibly named tauri-driver.exe or
// msedgedriver.exe, so there's no ownership ambiguity to worry about here.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROCESS_NAMES = ["tauri-driver", "msedgedriver"];
const DEV_PORT = 1420;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const DEV_SERVER_START_TIMEOUT_MS = 30000;
// Debug builds read their database from the default app data dir unless
// `GYROSCOPE_DATA_DIR` (see src-tauri/src/paths.rs) is set. Setting it here
// keeps every E2E run on its own throwaway database instead of the human's
// real one -- otherwise the E2E's app instance and the human's manually
// opened app would be writing the same SQLite file at the same time.
const E2E_DATA_DIR = path.join(os.tmpdir(), "gyroscope-e2e-data");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");

function powershell(command) {
  try {
    return execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return "";
  }
}

function cleanDrivers(label) {
  for (const name of PROCESS_NAMES) {
    const killed = powershell(
      `$p = Get-Process -Name '${name}' -ErrorAction SilentlyContinue; ` +
        `if ($p) { $p | Stop-Process -Force -ErrorAction SilentlyContinue; 'yes' }`,
    );
    if (killed) {
      console.log(`[run-e2e] ${label}: 残っていた ${name}.exe を終了した`);
    }
  }
}

// Returns true when the app's page is actually being served -- HTTP 200 and
// the app's `<div id="root">` marker present. Port 1420 being open is not
// enough (anything could be listening); this distinguishes a live app
// server from a stale listener.
function isDevServerServing() {
  return new Promise((resolve) => {
    const req = http.get(DEV_URL, { timeout: 2000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
        if (body.length > 4096) req.destroy();
      });
      res.on("end", () => resolve(res.statusCode === 200 && body.includes('id="root"')));
      res.on("error", () => resolve(false));
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureDevServer() {
  if (await isDevServerServing()) {
    console.log(`[run-e2e] ${DEV_URL} は既に配信中のため既存の dev server を再利用する`);
    return null;
  }
  console.log(`[run-e2e] ${DEV_URL} が未配信のため vite dev server を起動する...`);
  const child = spawn("node", [viteBin], { cwd: root, stdio: "ignore" });
  const deadline = Date.now() + DEV_SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`[run-e2e] vite dev server が起動中に終了した (exit=${child.exitCode})`);
    }
    if (await isDevServerServing()) {
      console.log(`[run-e2e] vite dev server が ${DEV_URL} で配信を開始した`);
      return child;
    }
    await wait(500);
  }
  spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  throw new Error(`[run-e2e] vite dev server が ${DEV_SERVER_START_TIMEOUT_MS / 1000}s 以内に応答しなかった`);
}

async function main() {
  cleanDrivers("実行前");

  process.env.GYROSCOPE_DATA_DIR = E2E_DATA_DIR;
  console.log(`[run-e2e] E2E用データディレクトリ: ${E2E_DATA_DIR}（人間の実データとは分離）`);

  let viteProcess = null;
  let exitCode = 0;
  try {
    viteProcess = await ensureDevServer();

    // wdio's own extra CLI args (e.g. `--spec e2e/specs/foo.spec.js`) are
    // forwarded as-is via `npm run test:e2e -- --spec ...`.
    const forwarded = process.argv.slice(2);
    // A single `--spec` run is a targeted debug/diagnostic invocation, so let
    // it also run zz-temp specs (which the full-suite run excludes); otherwise
    // the exclude pattern silently filters the very spec being asked for.
    if (forwarded.includes("--spec")) process.env.E2E_INCLUDE_TEMP = "1";
    const wdioArgs = ["wdio", "run", "e2e/wdio.conf.js", ...forwarded];
    const result = spawnSync("npx", wdioArgs, { cwd: root, stdio: "inherit", shell: true });
    exitCode = result.status ?? 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    exitCode = 1;
  } finally {
    cleanDrivers("実行後");
    if (viteProcess) {
      spawnSync("taskkill", ["/PID", String(viteProcess.pid), "/T", "/F"], { stdio: "ignore" });
      console.log("[run-e2e] 起動した vite dev server を終了した");
    }
  }
  process.exit(exitCode);
}

main();