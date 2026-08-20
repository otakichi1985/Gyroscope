import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useFeedsStore } from "../stores/feedsStore";
import { useAppearanceStore } from "../stores/appearanceStore";
import { useSmoothWheelScroll } from "../hooks/useSmoothWheelScroll";
import { useScrollTargetRef } from "../hooks/useScrollTargetRef";
import { BellIcon, BellOffIcon, CloseIcon, RefreshIcon, TrashIcon, WarningIcon } from "./icons";
import { ClearableInput } from "./ClearableInput";

const OPML_FILTER = [{ name: "OPML", extensions: ["opml", "xml"] }];

function GenreManager() {
  const { genres, createGenre, deleteGenre } = useFeedsStore();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createGenre(name.trim());
      setName("");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(genre: string) {
    setError(null);
    try {
      await deleteGenre(genre);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded border border-black/10 p-2 dark:border-white/10">
      <div className="text-xs font-medium opacity-70">ジャンルを管理</div>
      {genres.length === 0 ? (
        <p className="text-xs opacity-50">まだジャンルがありません</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {genres.map((genre) => (
            <span
              key={genre}
              className="flex items-center gap-1 rounded-full bg-black/5 py-0.5 pl-2 pr-1 text-xs dark:bg-white/5"
            >
              {genre}
              <button
                type="button"
                onClick={() => handleDelete(genre)}
                aria-label={`${genre}を削除`}
                title={`${genre}を削除（このジャンルのフィードは未分類に戻ります）`}
                className="flex items-center rounded-full p-0.5 opacity-50 transition-colors duration-150 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
              >
                <CloseIcon className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="text-xs font-medium opacity-70">ジャンルを追加</div>
      <form onSubmit={handleCreate} className="flex items-center gap-1">
        {/* Not the dashed "+" composer anymore -- a filled chip read as a
            button, and two near-identical rows (feed URL / genre name) were
            indistinguishable. Instead each form now carries an explicit
            label (フィードを追加 / ジャンルを追加) above it, so the rows are
            told apart by what they say, not by how they're framed. */}
        <ClearableInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新しいジャンル名"
          aria-label="新しいジャンル名"
          clearLabel="ジャンル名をクリア"
          onClear={() => setName("")}
          wrapperClassName="min-w-0 flex-1"
          className="w-full rounded border border-black/10 bg-black/5 px-2 py-1 text-xs outline-none placeholder:opacity-50 dark:border-white/10 dark:bg-white/5"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="shrink-0 rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
        >
          追加
        </button>
      </form>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function FeedManager() {
  const {
    feeds,
    genres,
    loading,
    error,
    refresh,
    refreshGenres,
    addFeed,
    deleteFeed,
    refreshFeed,
    setFeedNotify,
    setFeedInterval,
    setFeedFolder,
    importOpml,
    exportOpml,
  } = useFeedsStore();
  const smoothScroll = useAppearanceStore((s) => s.smoothScroll);
  const wheelRef = useSmoothWheelScroll<HTMLDivElement>(smoothScroll);
  const targetRef = useScrollTargetRef<HTMLDivElement>();
  const scrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      wheelRef(el);
      targetRef(el);
    },
    [wheelRef, targetRef],
  );
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [opmlMessage, setOpmlMessage] = useState<string | null>(null);
  const [opmlError, setOpmlError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    refreshGenres();
  }, [refresh, refreshGenres]);

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
      await refreshGenres();
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
    <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-sm">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={handleImport}
          className="flex-1 rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
        >
          インポート
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="flex-1 rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
        >
          エクスポート
        </button>
      </div>
      {opmlMessage && <p className="text-xs opacity-70">{opmlMessage}</p>}
      {opmlError && <p className="text-xs text-red-500">{opmlError}</p>}

      <div className="text-xs font-medium opacity-70">フィードを追加</div>
      <form onSubmit={handleAdd} className="flex gap-1">
        <ClearableInput
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/feed.xml"
          aria-label="フィードのURL"
          clearLabel="フィードのURLをクリア"
          onClear={() => setUrl("")}
          wrapperClassName="min-w-0 flex-1"
          className="w-full rounded border border-black/10 bg-black/5 px-2 py-1 text-xs outline-none dark:border-white/10 dark:bg-white/5"
        />
        <button
          type="submit"
          disabled={adding}
          className="rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
        >
          {adding ? "..." : "追加"}
        </button>
      </form>
      {addError && <p className="text-xs text-red-500">{addError}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs opacity-60">
        記事系サイト以外や、一部サイトからはRSSを取得できない場合があります。BOOTHショップのURL（例:
        https://example.booth.pm/）にも対応しています
      </p>

      {/* Genre-first, folder-like organization: create a genre here, then
          assign feeds into it below via a <select> -- replaces the old
          free-text-per-feed field, where reusing a genre meant retyping the
          exact same string and any mismatch (case, full/half-width, a
          stray space) silently created a separate genre instead of joining
          the existing one (user feedback). */}
      <GenreManager />

      {loading && feeds.length === 0 ? (
        <p className="opacity-60">読み込み中...</p>
      ) : feeds.length === 0 ? (
        // Kept inline rather than the full-height StatePanel: this sits
        // directly under the add-feed form that already tells you what to
        // do, so it only needs to fill the gap, not restate the CTA.
        <p className="rounded border border-dashed border-black/15 px-3 py-6 text-center text-xs opacity-50 dark:border-white/15">
          フィードがまだありません
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {feeds.map((feed) => (
            <li
              key={feed.id}
              className="flex flex-col gap-1 rounded px-2 py-1.5 transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5"
            >
              <div className="flex items-center gap-1 truncate">
                {feed.last_error && (
                  <span title={feed.last_error} className="text-red-500">
                    <WarningIcon className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="truncate font-medium">{feed.custom_title ?? feed.title ?? feed.url}</span>
                {feed.source_type === "booth" && (
                  // BOOTH feeds get a longer default refresh interval and a
                  // different fetch mechanism under the hood (see
                  // fetch::booth) -- this badge is the only place that's
                  // visible to the user, so they know why e.g. the interval
                  // field defaulted to 60 instead of 30.
                  <span className="accent-bg-soft accent-text shrink-0 rounded px-1 text-[10px] font-medium">
                    BOOTH
                  </span>
                )}
                {feed.unread_count > 0 && (
                  // tabular-nums so the count keeps a fixed width as it
                  // changes -- otherwise every refresh nudges the row's
                  // layout by a pixel or two as digits swap.
                  <span className="shrink-0 text-xs tabular-nums opacity-60">({feed.unread_count})</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={feed.folder ?? ""}
                  onChange={(e) => setFeedFolder(feed.id, e.target.value || null)}
                  className="min-w-0 flex-1 rounded border border-black/10 bg-black/5 px-1 py-0.5 text-xs outline-none dark:border-white/10 dark:bg-white/5"
                  aria-label="ジャンル"
                >
                  <option value="" className="text-black">
                    未分類
                  </option>
                  {genres.map((genre) => (
                    <option key={genre} value={genre} className="text-black">
                      {genre}
                    </option>
                  ))}
                </select>
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
                  // Icon-only bell buttons read as "something about
                  // notifications" but never made it obvious that the
                  // setting is a plain on/off toggle. A labelled pill with
                  // an explicit 通知ON/通知OFF state (accent fill when on)
                  // makes the toggle and its current state visible at rest.
                  className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors duration-150 ${
                    feed.notify_enabled
                      ? "accent-bg-soft accent-text font-medium"
                      : "bg-black/5 opacity-70 hover:opacity-100 dark:bg-white/5"
                  }`}
                  aria-label={feed.notify_enabled ? "通知を無効にする" : "通知を有効にする"}
                  aria-pressed={feed.notify_enabled}
                  title={feed.notify_enabled ? "新着を通知しています（クリックでOFF）" : "通知はオフです（クリックでON）"}
                >
                  {feed.notify_enabled ? <BellIcon className="h-3 w-3" /> : <BellOffIcon className="h-3 w-3" />}
                  <span>{feed.notify_enabled ? "通知ON" : "通知OFF"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => refreshFeed(feed.id)}
                  className="flex shrink-0 items-center rounded p-1 opacity-60 transition-colors duration-150 hover:opacity-100 active:bg-black/10 dark:active:bg-white/10"
                  aria-label="更新"
                >
                  <RefreshIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteFeed(feed.id)}
                  className="flex shrink-0 items-center rounded p-1 opacity-60 transition-colors duration-150 hover:opacity-100 active:bg-black/10 dark:active:bg-white/10"
                  aria-label="削除"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
