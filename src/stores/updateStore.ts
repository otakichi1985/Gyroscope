import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type UpdateStatus =
  | { kind: "unsupported" }
  | { kind: "notConfigured" }
  | { kind: "upToDate" }
  | { kind: "available"; version: string; notes: string; publishedAt: string };

interface UpdateCheckResponse {
  currentVersion: string;
  status: UpdateStatus;
}

type Phase = "idle" | "checking" | "downloading" | "applying" | "rollingBack";

interface UpdateStoreState {
  currentVersion: string | null;
  backupVersion: string | null;
  status: UpdateStatus | null;
  phase: Phase;
  error: string | null;
  loadStatic: () => Promise<void>;
  check: () => Promise<void>;
  download: () => Promise<void>;
  apply: () => Promise<void>;
  rollback: () => Promise<void>;
}

const LAST_CHECK_KEY = "gyroscope:last-update-check";
// Once a day is enough for a background check that's silent unless it
// finds something -- frequent enough that a real update surfaces within a
// day of launching the app, infrequent enough to never feel like nagging.
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const useUpdateStore = create<UpdateStoreState>((set) => ({
  currentVersion: null,
  backupVersion: null,
  status: null,
  phase: "idle",
  error: null,

  // Version + rollback availability need no network access, so these load
  // independently of (and before) any update check -- Settings can show
  // "現在のバージョン" immediately, offline or not.
  loadStatic: async () => {
    const [currentVersion, backupVersion] = await Promise.all([
      invoke<string>("get_app_version"),
      invoke<string | null>("get_update_backup_info"),
    ]);
    set({ currentVersion, backupVersion });
  },

  check: async () => {
    set({ phase: "checking", error: null });
    try {
      const res = await invoke<UpdateCheckResponse>("check_for_update");
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
      set({ currentVersion: res.currentVersion, status: res.status, phase: "idle" });
    } catch (e) {
      // Recorded even on failure (e.g. offline) -- otherwise a machine
      // that's briefly disconnected at every startup would retry on every
      // single launch instead of waiting out the normal interval.
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
      set({ error: String(e), phase: "idle" });
    }
  },

  download: async () => {
    set({ phase: "downloading", error: null });
    try {
      await invoke("download_update");
      set({ phase: "idle" });
    } catch (e) {
      set({ error: String(e), phase: "idle" });
    }
  },

  apply: async () => {
    set({ phase: "applying", error: null });
    try {
      // On success the process exits from the Rust side before this
      // promise would otherwise resolve -- the catch below only ever
      // fires for a genuine failure to relaunch.
      await invoke("apply_update");
    } catch (e) {
      set({ error: String(e), phase: "idle" });
    }
  },

  rollback: async () => {
    set({ phase: "rollingBack", error: null });
    try {
      await invoke("rollback_update");
    } catch (e) {
      set({ error: String(e), phase: "idle" });
    }
  },
}));

export function dueForAutoCheck(): boolean {
  const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? "0");
  return Date.now() - last > AUTO_CHECK_INTERVAL_MS;
}
