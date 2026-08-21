import { useUpdateStore } from "../stores/updateStore";
import { useUiStore } from "../stores/uiStore";
import { CloseIcon } from "./icons";

/**
 * In-app notice shown when a background/manual check finds a newer version
 * (in ダウンロードまでおまかせ / 確認のみ modes -- おまかせ installs silently and
 * restarts on its own). Appears once per found version per launch: dismissing
 * it silences the notice for the session, but a still-pending update shows it
 * again on the next start (each launch re-checks) until it's actually applied.
 */
export function UpdateNoticePopup() {
  const status = useUpdateStore((s) => s.status);
  const downloaded = useUpdateStore((s) => s.downloaded);
  const phase = useUpdateStore((s) => s.phase);
  const updateMode = useUpdateStore((s) => s.updateMode);
  const notifiedVersion = useUpdateStore((s) => s.notifiedVersion);
  const download = useUpdateStore((s) => s.download);
  const apply = useUpdateStore((s) => s.apply);
  const dismissUpdateNotice = useUpdateStore((s) => s.dismissUpdateNotice);
  const openSettingsSection = useUiStore((s) => s.openSettingsSection);

  if (status?.kind !== "available") return null;
  if (updateMode === "auto") return null;
  if (notifiedVersion === status.version) return null;

  const busy = phase !== "idle";

  const handleUpdate = async () => {
    if (!downloaded) {
      const ok = await download();
      if (!ok) return;
    }
    await apply();
  };

  const handleSettings = () => {
    dismissUpdateNotice();
    openSettingsSection("update");
  };

  const publishedLabel = (() => {
    try {
      return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" }).format(
        new Date(status.publishedAt),
      );
    } catch {
      return status.publishedAt;
    }
  })();

  return (
    <div
      role="dialog"
      aria-label="新しいバージョンのお知らせ"
      className="update-notice panel-bg absolute inset-x-3 bottom-3 z-50 flex max-w-sm flex-col gap-2 rounded-lg border border-black/15 p-3 text-xs shadow-xl ring-1 ring-black/5 dark:border-white/15 dark:ring-white/5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">新しいバージョンがあります</p>
        <button
          type="button"
          onClick={dismissUpdateNotice}
          aria-label="お知らせを閉じる"
          className="shrink-0 rounded p-1 opacity-60 transition-colors duration-150 hover:bg-black/10 hover:opacity-100 active:bg-black/20 dark:hover:bg-white/10 dark:active:bg-white/20"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="opacity-80">
        v{status.version}（{publishedLabel}）
        {downloaded ? " — ダウンロード済みです" : ""}
      </p>
      {status.notes && (
        <p className="allow-text-selection max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed opacity-70">
          {status.notes}
        </p>
      )}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void handleUpdate()}
          disabled={busy}
          className="accent-bg flex-1 rounded px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90 active:opacity-80 disabled:opacity-50"
        >
          {phase === "downloading"
            ? "ダウンロード中..."
            : phase === "applying"
              ? "再起動しています..."
              : "更新して再起動"}
        </button>
        <button
          type="button"
          onClick={handleSettings}
          className="rounded bg-black/10 px-3 py-1.5 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
        >
          設定で確認
        </button>
      </div>
    </div>
  );
}