import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type UpdateStatus =
  | { kind: "unsupported" }
  | { kind: "upToDate" }
  | { kind: "available"; version: string; notes: string; publishedAt: string };

export type UpdateMode = "auto" | "download" | "manual";

export const UPDATE_MODE_LABELS: Record<UpdateMode, string> = {
  auto: "インストールまでおまかせ（表示中に再起動することがあります）",
  download: "ダウンロードまでおまかせ",
  manual: "確認のみ（手動で更新）",
};

interface UpdateCheckResponse {
  currentVersion: string;
  status: UpdateStatus;
}

type Phase = "idle" | "checking" | "downloading" | "applying" | "rollingBack";

const UPDATE_MODE_STORAGE_KEY = "gyroscope:update-mode";

function loadUpdateMode(): UpdateMode {
  const saved = localStorage.getItem(UPDATE_MODE_STORAGE_KEY);
  if (saved === "auto" || saved === "download" || saved === "manual") return saved;
  return "manual";
}

interface UpdateStoreState {
  currentVersion: string | null;
  backupVersion: string | null;
  status: UpdateStatus | null;
  phase: Phase;
  error: string | null;
  updateMode: UpdateMode;
  downloaded: boolean;
  downloadedVersion: string | null;
  notifiedVersion: string | null;
  setUpdateMode: (mode: UpdateMode) => void;
  dismissUpdateNotice: () => void;
  loadStatic: () => Promise<void>;
  check: () => Promise<void>;

  download: () => Promise<boolean>;
  apply: () => Promise<void>;
  rollback: () => Promise<void>;
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  currentVersion: null,
  backupVersion: null,
  status: null,
  phase: "idle",
  error: null,
  updateMode: loadUpdateMode(),
  downloaded: false,
  downloadedVersion: null,
  notifiedVersion: null,

  setUpdateMode: (mode: UpdateMode) => {
    localStorage.setItem(UPDATE_MODE_STORAGE_KEY, mode);
    set({ updateMode: mode });
  },

  dismissUpdateNotice: () => {
    const { status } = get();
    if (status?.kind !== "available") return;
    set({ notifiedVersion: status.version });
  },

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
      const alreadyDownloaded =
        res.status.kind === "available" && get().downloadedVersion === res.status.version;
      set({
        currentVersion: res.currentVersion,
        status: res.status,
        phase: "idle",
        downloaded: alreadyDownloaded,
      });
      if (res.status.kind === "available" && !alreadyDownloaded) {
        const mode = get().updateMode;
        if (mode === "auto") {
          void (async () => {
            const ok = await get().download();
            if (ok) await get().apply();
          })();
        } else if (mode === "download") {
          void get().download();
        }
      }
    } catch (e) {
      set({ error: String(e), phase: "idle" });
    }
  },

  download: async () => {
    set({ phase: "downloading", error: null });
    try {
      await invoke("download_update");
      const st = get().status;
      const version = st?.kind === "available" ? st.version : null;
      set({ phase: "idle", downloaded: version !== null, downloadedVersion: version });
      return true;
    } catch (e) {
      set({ error: String(e), phase: "idle" });
      return false;
    }
  },

  apply: async () => {
    set({ phase: "applying", error: null });
    try {
      await invoke("apply_update");
    } catch (e) {
      set({ error: String(e), phase: "idle" });
    }
  },

  rollback: async () => {
    set({ phase: "rollingBack", error: null });
    try {
      await invoke("rollback_update");
      set({ downloaded: false, downloadedVersion: null });
    } catch (e) {
      set({ error: String(e), phase: "idle" });
    }
  },
}));
