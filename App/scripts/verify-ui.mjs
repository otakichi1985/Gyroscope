// Single entry point for AI/developer UI verification.
//
// The real source of truth is the Tauri-window E2E harness. This wrapper makes
// the available verification path explicit before running it, so a missing
// driver, binary, or dev server is not mistaken for a UI failure.

import { existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appBinaryPath = path.join(root, "src-tauri", "target", "debug", "gyroscope.exe");
const devUrl = "http://localhost:1420/";

function commandExists(command) {
  try {
    execFileSync("where.exe", [command], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function checkDevServer() {
  return new Promise((resolve) => {
    const request = http.get(devUrl, { timeout: 1500 }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(response.statusCode === 200 && body.includes('id="root"')));
      response.on("error", () => resolve(false));
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

function printStatus(name, status, detail) {
  console.log(`[verify-ui] ${name}: ${status}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const forwarded = process.argv.slice(2);
  const checkOnly = forwarded.includes("--check-only");
  const realData = forwarded.includes("--real-data");
  const e2eArgs = forwarded.filter((arg) => arg !== "--check-only");
  const filteredArgs = e2eArgs.filter((arg) => arg !== "--real-data");
  if (!filteredArgs.includes("--spec")) {
    filteredArgs.push("--spec", realData ? "e2e/specs/real-data-home.spec.js" : "e2e/specs/ui-audit.spec.js");
  }

  console.log("[verify-ui] UI検証経路を診断する");
  printStatus(
    "native-e2e",
    existsSync(appBinaryPath) ? "AVAILABLE" : "BLOCKED",
    existsSync(appBinaryPath) ? "debug exeあり" : `debug exeなし: ${appBinaryPath}`,
  );
  printStatus(
    "tauri-driver",
    commandExists("tauri-driver") ? "AVAILABLE" : "AUTO_INSTALL_REQUIRED",
    commandExists("tauri-driver") ? "PATHから利用可能" : "tauri-serviceの自動導入を試行（外部provider）",
  );
  const edgeDriverAvailable = commandExists("msedgedriver");
  printStatus(
    "edge-driver",
    edgeDriverAvailable ? "AVAILABLE" : "AUTO_DOWNLOAD_REQUIRED",
    edgeDriverAvailable ? "PATHから利用可能" : "tauri-serviceの自動取得を試行",
  );
  printStatus(
    "browser-preview",
    (await checkDevServer()) ? "AVAILABLE_LIMITED" : "NOT_SERVING",
    "UI骨格のみ。Tauri DB/Rust command/eventは利用不可",
  );

  if (!existsSync(appBinaryPath)) {
    console.error("[verify-ui] native-e2eを実行できない: 先に `npm run tauri build -- --debug` 等でdebug exeを生成する");
    process.exit(2);
  }
  if (checkOnly) {
    console.log("[verify-ui] check-only: 診断のみで終了した");
    return;
  }

  console.log(`[verify-ui] native-e2eを実行する: ${e2eArgs.join(" ")}`);
  const childEnv = { ...process.env };
  if (realData) childEnv.GYROSCOPE_SOURCE_DATA_DIR = process.env.APPDATA + "\\com.noxrss.gyroscope";
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "run-e2e.mjs"), ...filteredArgs], {
    cwd: root,
    stdio: "inherit",
    env: childEnv,
  });
  const exitCode = result.status ?? 1;
  if (exitCode === 0) {
    console.log("[verify-ui] RESULT=NATIVE_E2E_PASS");
  } else if (result.error?.code === "ENOENT") {
    console.error("[verify-ui] RESULT=INFRASTRUCTURE_ERROR — E2E起動コマンドが見つからない");
  } else if (!edgeDriverAvailable && !commandExists("tauri-driver")) {
    console.error(
      `[verify-ui] RESULT=INFRASTRUCTURE_ERROR exit=${exitCode} — ` +
        "Edge WebDriverとtauri-driverの自動導入に失敗した。UIスペックは未実行",
    );
  } else {
    console.error(`[verify-ui] RESULT=NATIVE_E2E_FAIL exit=${exitCode} — UIスペックまたはTauriアプリの失敗`);
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(`[verify-ui] RESULT=INFRASTRUCTURE_ERROR — ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
