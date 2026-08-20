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
  // How far the auto-update pipeline runs on its own: おまかせ installs and
  // restarts, ダウンロードまでおまかせ fetches the package (the user applies
  // it), 確認のみ just notifies. Persisted across launches.
  updateMode: UpdateMode;
  // True once the update package has been downloaded (auto mode installs
  // immediately, so this mainly matters for ダウンロードまでおまかせ: the apply
  // step can skip re-downloading). Tracked per-version so a *newer* release
  // appearing after a download starts fresh.
  downloaded: boolean;
  // The version whose package was downloaded, for the `downloaded` check.
  downloadedVersion: string | null;
  // Version the in-app notice has already been shown for this session. Reset
  // on every launch, so an update that's still pending shows its notice again
  // on the next start until the user actually updates -- but never re-nags
  // within one session's periodic checks.
  notifiedVersion: string | null;
  setUpdateMode: (mode: UpdateMode) => void;
  dismissUpdateNotice: () => void;
  loadStatic: () => Promise<void>;
  check: () => Promise<void>;
  /** Resolves true when the download completed. */
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
      // A different (newer) version appearing after a download resets the
      // downloaded flag so the new package is fetched rather than applying
      // the stale one.
      const alreadyDownloaded =
        res.status.kind === "available" && get().downloadedVersion === res.status.version;
      set({
        currentVersion: res.currentVersion,
        status: res.status,
        phase: "idle",
        downloaded: alreadyDownloaded,
      });
      // Automatic handling per the chosen mode. Both run detached (void) so
      // this check() resolves with the status immediately -- the notice / UI
      // reflects the found update without waiting on the download.
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
      // The rolled-back state is no longer the downloaded package.
      set({ downloaded: false, downloadedVersion: null });
    } catch (e) {
      set({ error: String(e), phase: "idle" });
    }
  },
}));