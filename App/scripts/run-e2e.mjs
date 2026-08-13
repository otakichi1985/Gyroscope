// Wraps `wdio run e2e/wdio.conf.js`, cleaning up its driver processes both
// before and after -- unlike npm's pre/post script hooks, this always runs
// the after-cleanup even when wdio exits non-zero (a failing spec, a
// crashed run), which is exactly when a driver is most likely to be left
// behind.
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

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROCESS_NAMES = ["tauri-driver", "msedgedriver"];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

cleanDrivers("実行前");

// wdio's own extra CLI args (e.g. `--spec e2e/specs/foo.spec.js`) are
// forwarded as-is via `npm run test:e2e -- --spec ...`.
const wdioArgs = ["wdio", "run", "e2e/wdio.conf.js", ...process.argv.slice(2)];
const result = spawnSync("npx", wdioArgs, { cwd: root, stdio: "inherit", shell: true });

cleanDrivers("実行後");

process.exit(result.status ?? 1);
