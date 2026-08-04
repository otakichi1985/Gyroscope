import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useFeedsStore } from "../stores/feedsStore";

const OPML_FILTER = [{ name: "OPML", extensions: ["opml", "xml"] }];

export function FeedManager() {
  const {
    feeds,
    loading,
    error,
    refresh,
    addFeed,
    deleteFeed,
    refreshFeed,
    setFeedNotify,
    setFeedInterval,
    importOpml,
    exportOpml,
  } = useFeedsStore();
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [opmlMessage, setOpmlMessage] = useState<string | null>(null);
  const [opmlError, setOpmlError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await addFeed(url.trim());
      setUrl("");
    } catch (err) {
      setAddError(String(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleImport() {
    setOpmlError(null);
    setOpmlMessage(null);
    try {
      const path = await open({ filters: OPML_FILTER, multiple: false, directory: false });
      if (!path || Array.isArray(path)) return;
      const summary = await importOpml(path);
      setOpmlMessage(`${summary.added}件追加、${summary.skipped}件スキップ`);
    } catch (err) {
      setOpmlError(String(err));
    }
  }

  async function handleExport() {
    setOpmlError(null);
    setOpmlMessage(null);
    try {
      const path = await save({ filters: OPML_FILTER, defaultPath: "feeds.opml" });
      if (!path) return;
      await exportOpml(path);
      setOpmlMessage("エクスポートしました");
    } catch (err) {
      setOpmlError(String(err));
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3 text-sm">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={handleImport}
          className="flex-1 rounded bg-black/10 px-2 py-1 text-xs hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
        >
          インポート
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="flex-1 rounded bg-black/10 px-2 py-1 text-xs hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
        >
          エクスポート
        </button>
      </div>
      {opmlMessage && <p className="text-xs opacity-70">{opmlMessage}</p>}
      {opmlError && <p className="text-xs text-red-500">{opmlError}</p>}

      <form onSubmit={handleAdd} className="flex gap-1">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/feed.xml"
          className="min-w-0 flex-1 rounded border border-black/10 bg-black/5 px-2 py-1 text-xs outline-none dark:border-white/10 dark:bg-white/5"
        />
        <button
          type="submit"
          disabled={adding}
          className="rounded bg-black/10 px-2 py-1 text-xs hover:bg-black/20 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/20"
        >
          {adding ? "..." : "追加"}
        </button>
      </form>
      {addError && <p className="text-xs text-red-500">{addError}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {loading && feeds.length === 0 ? (
        <p className="opacity-60">読み込み中...</p>
      ) : feeds.length === 0 ? (
        <p className="opacity-60">フィードがまだありません</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {feeds.map((feed) => (
            <li
              key={feed.id}
              className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 truncate">
                  {feed.last_error && (
                    <span title={feed.last_error} className="text-red-500">
                      ⚠
                    </span>
                  )}
                  <span className="truncate font-medium">{feed.custom_title ?? feed.title ?? feed.url}</span>
                  {feed.unread_count > 0 && (
                    <span className="shrink-0 text-xs opacity-60">({feed.unread_count})</span>
                  )}
                </div>
              </div>
              <input
                type="number"
                min={1}
                placeholder="既定(30分)"
                defaultValue={feed.interval_min ?? ""}
                onBlur={(e) =>
                  setFeedInterval(feed.id, e.target.value === "" ? null : Number(e.target.value))
                }
                className="w-16 shrink-0 rounded border border-black/10 bg-black/5 px-1 py-0.5 text-xs outline-none dark:border-white/10 dark:bg-white/5"
                aria-label="更新間隔（分）"
              />
              <button
                type="button"
                onClick={() => setFeedNotify(feed.id, !feed.notify_enabled)}
                className="shrink-0 rounded px-1 text-xs opacity-60 hover:opacity-100"
                aria-label={feed.notify_enabled ? "通知を無効にする" : "通知を有効にする"}
              >
                {feed.notify_enabled ? "🔔" : "🔕"}
              </button>
              <button
                type="button"
                onClick={() => refreshFeed(feed.id)}
                className="shrink-0 rounded px-1 text-xs opacity-60 hover:opacity-100"
                aria-label="更新"
              >
                ⟳
              </button>
              <button
                type="button"
                onClick={() => deleteFeed(feed.id)}
                className="shrink-0 rounded px-1 text-xs opacity-60 hover:opacity-100"
                aria-label="削除"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
