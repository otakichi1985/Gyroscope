// Builds a portable package: frontend + release exe, dropped into
// dist-portable/ next to a `.portable` marker file. Presence of that
// marker is what src-tauri/src/paths.rs uses to decide the app should
// store its data in a `data/` folder beside the exe instead of the normal
// per-user AppData location -- see CLAUDE.md's "共有用にポータブル版
// パッケージ" section for the full rationale.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tauriDir = path.join(root, "src-tauri");
const exeName = "gyroscope.exe";
const outDir = path.join(root, "dist-portable");
// バージョンをzip名に埋め込む。ビルドのたびに同じ`gyroscope-portable.zip`を
// 上書きしていると、配布物だけを見てもどのバージョンか判別できなかったため
// （ユーザー報告）。バージョンは`package.json`を単一の情報源として読む
// （`tauri.conf.json`/`Cargo.toml`も同じ値を持つが、更新のたびに3箇所を
// 同期させる負担を避けるため、ビルドの起点である`npm run build`が読む
// package.jsonをここでも参照する）。
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const zipPath = path.join(root, `gyroscope-portable-v${version}.zip`);
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
// extension.
//
// The archived entries are listed explicitly (rather than passing `.` for
// bsdtar to walk) for two reasons:
//   - `.portable` must not be skipped as a dotfile, which a shell-expanded
//     `*` would do.
//   - Passing `.` itself is worse than that: bsdtar then writes an actual
//     zip entry for the directory named `./`, and Windows' *built-in*
//     "Extract All" (zipfldr.dll) chokes on that leading entry -- it opens
//     the archive to zero visible items with no error message. 7-Zip and
//     other third-party tools parse the exact same bytes without
//     complaint, which is why this only ever showed up as "portable build
//     won't extract" from users who don't have 7-Zip (confirmed via a
//     byte-level EOCD/central-directory read of the produced .zip, and by
//     opening it through Explorer's own Shell.Application COM interface --
//     item count 0 with the `.` entry present, correct with it absent).
//     Listing the top-level names directly produces the identical file set
//     without ever emitting that entry.
const entries = [".portable", "data", ...companionFiles, exeName];
rmSync(zipPath, { force: true });
run("tar", ["-a", "-c", "-f", zipPath, "-C", outDir, ...entries], root);

console.log(`\nポータブル版を作成しました: ${outDir}`);
console.log("README.md とサンプルフィード sample.opml も同梱しました。");
console.log(`配布用ZIPを作成しました: ${zipPath}`);
