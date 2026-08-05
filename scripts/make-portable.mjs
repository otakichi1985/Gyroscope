// Builds a portable package: frontend + release exe, dropped into
// dist-portable/ next to a `.portable` marker file. Presence of that
// marker is what src-tauri/src/paths.rs uses to decide the app should
// store its data in a `data/` folder beside the exe instead of the normal
// per-user AppData location -- see CLAUDE.md's "共有用にポータブル版
// パッケージ" section for the full rationale.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tauriDir = path.join(root, "src-tauri");
const exeName = "rss-widget.exe";
const outDir = path.join(root, "dist-portable");
const zipPath = path.join(root, "rss-widget-portable.zip");
const companionFiles = ["README.md", "sample.opml"];

function run(cmd, args, cwd) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

if (process.platform === "win32") {
  // Windows cannot spawn a .cmd file directly through execFileSync. Invoke
  // this fixed command via cmd.exe instead of enabling `shell: true` for
  // arbitrary arguments (which Node warns is unsafe and deprecated).
  run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm run build"], root);
} else {
  run("npm", ["run", "build"], root);
}
// --features custom-protocol is required for a standalone build: without
// it the compiled exe still expects a Vite dev server at localhost:1420
// (same switch `tauri build` flips automatically; we call cargo directly
// here, so it has to be passed explicitly). See src-tauri/Cargo.toml.
run("cargo", ["build", "--release", "--features", "custom-protocol"], tauriDir);

const releaseExe = path.join(tauriDir, "target", "release", exeName);
if (!existsSync(releaseExe)) {
  throw new Error(`release exe not found at ${releaseExe}`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
copyFileSync(releaseExe, path.join(outDir, exeName));
for (const file of companionFiles) {
  const source = path.join(root, file);
  if (!existsSync(source)) {
    throw new Error(`portable companion file not found: ${source}`);
  }
  copyFileSync(source, path.join(outDir, file));
}
writeFileSync(path.join(outDir, ".portable"), "");
mkdirSync(path.join(outDir, "data"), { recursive: true });

// Windows 11 ships bsdtar as `tar.exe`; `-a` selects ZIP from the output
// extension. Archiving `.` (rather than `*`) is important because the
// `.portable` marker must not be skipped as a dotfile.
rmSync(zipPath, { force: true });
run("tar", ["-a", "-c", "-f", zipPath, "-C", outDir, "."], root);

console.log(`\nポータブル版を作成しました: ${outDir}`);
console.log("README.md とサンプルフィード sample.opml も同梱しました。");
console.log(`配布用ZIPを作成しました: ${zipPath}`);
