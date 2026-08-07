import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri` and `dist-portable` --
      // the latter is written by `npm run package:portable`, and watching
      // it crashed the dev server with EBUSY when that script's file copy
      // and Vite's watcher raced on the same exe (found running both at
      // once during this feature's development).
      //
      // Also ignore `.claude/worktrees` -- background agent sessions check
      // out separate worktrees under here, and without this Vite's watcher
      // picks up their file churn too and reloads this dev server for
      // changes that have nothing to do with it.
      ignored: ["**/src-tauri/**", "**/dist-portable/**", "**/.claude/worktrees/**"],
    },
  },
}));
