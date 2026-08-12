// Clears whatever a previous `npm run tauri dev` left behind, so starting one
// never fails on "port 1420 is already in use".
//
// Why this is needed: the two halves of `tauri dev` die independently. The
// Rust side gets force-killed and rebuilt whenever a file under src-tauri/
// changes, and Vite has been seen to fall over on its own -- so either half
// can outlive the other. Vite is pinned to 1420 with strictPort (Tauri's
// devUrl points at it and cannot follow a moving port), which turns a stray
// Vite into a hard block on the next run. There is nothing obvious in the UI
// to fix by hand.
//
// Runs from `npm run dev`, which is Tauri's beforeDevCommand, so it happens on
// every `npm run tauri dev` without anyone remembering to.
//
// Deliberately conservative: it only kills node holding the port, and only a
// gyroscope.exe that is the debug build from this checkout. An installed copy
// of the app the user happens to be running, or some unrelated program on
// 1420, is reported and left alone.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 1420;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const debugExe = path.join(root, "src-tauri", "target", "debug", "gyroscope.exe");

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

// ConvertTo-Json emits a bare object for one result and an array for several.
function asList(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function kill(pid) {
  powershell(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`);
}

function clearPort() {
  const holders = asList(
    powershell(
      `$c = Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue; ` +
        `@(foreach ($x in $c) { $p = Get-Process -Id $x.OwningProcess -ErrorAction SilentlyContinue; ` +
        `[pscustomobject]@{ pid = $x.OwningProcess; name = $p.Name } }) | ConvertTo-Json -Compress`,
    ),
  );

  for (const holder of holders) {
    if (holder.name === "node") {
      kill(holder.pid);
      console.log(`[dev-clean] 前回の開発サーバー (node ${holder.pid}) が残っていたので終了した`);
    } else {
      console.warn(
        `[dev-clean] ポート ${PORT} を ${holder.name ?? "不明なプログラム"} (${holder.pid}) が使っている。` +
          `これは自動で止めない -- 手動で終了するか、そのプログラムの設定を変えてほしい`,
      );
    }
  }
}

function clearOrphanApp() {
  const running = asList(
    powershell(
      `@(Get-Process -Name gyroscope -ErrorAction SilentlyContinue | ` +
        `Select-Object @{n='pid';e={$_.Id}}, @{n='path';e={$_.Path}}) | ConvertTo-Json -Compress`,
    ),
  );

  for (const app of running) {
    // Only this checkout's debug build. An installed/portable copy the user is
    // actually using has a different path and is none of our business.
    if (app.path && path.resolve(app.path).toLowerCase() === debugExe.toLowerCase()) {
      kill(app.pid);
      console.log(`[dev-clean] 前回の開発版アプリ (${app.pid}) が残っていたので終了した`);
    }
  }
}

try {
  clearPort();
  clearOrphanApp();
} catch (err) {
  // Never block the dev server: if the cleanup itself breaks, let Vite start
  // and report the real problem in its own words.
  console.warn("[dev-clean] 掃除に失敗した（このまま起動を続ける）:", err.message);
}
