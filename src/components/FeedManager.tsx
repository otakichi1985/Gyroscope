import { useEffect, useState } from "react";
import { useFeedsStore } from "../stores/feedsStore";

export function FeedManager() {
  const { feeds, loading, error, refresh, addFeed, deleteFeed, refreshFeed } = useFeedsStore();
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3 text-sm">
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
