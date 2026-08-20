import { useCallback, useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { formatPublished } from "../lib/text";
import { useHistoryStore } from "../stores/historyStore";
import { useUiStore } from "../stores/uiStore";
import { useAppearanceStore } from "../stores/appearanceStore";
import { useSmoothWheelScroll } from "../hooks/useSmoothWheelScroll";
import { useScrollTargetRef } from "../hooks/useScrollTargetRef";
import { ScreenOverlay } from "./ScreenOverlay";
import { StatePanel } from "./StatePanel";
import { ClockIcon } from "./icons";

const HTTP_LINK_RE = /^https?:\/\//i;

export function HistoryOverlay() {
  const isActive = useUiStore((s) => s.activeScreen === "history");
  const { entries, loading, error, refresh, clear } = useHistoryStore();
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

  // Was `useEffect(() => { refresh(); }, [refresh])` -- since `refresh` is a
  // stable Zustand action reference, that effect only ever ran once, on this
  // (always-mounted, see App.tsx) component's first mount. Opening History
  // after that point kept showing whatever snapshot existed at app startup,
  // never picking up entries read afterward (reported as "履歴が保存できて
  // いない" -- the writes were fine, the panel just never re-fetched).
  // Re-fetching on every activation (same pattern as TrashOverlay) fixes it.
  useEffect(() => {
    if (isActive) refresh();
  }, [isActive, refresh]);

  async function handleOpen(link: string | null) {
    if (link && HTTP_LINK_RE.test(link)) {
      await openUrl(link);
    }
  }

  return (
    <ScreenOverlay screen="history" title="既読履歴">
      <div className="flex shrink-0 items-center justify-between border-b border-black/10 px-2 py-1 text-xs dark:border-white/10">
        <span className="opacity-60">記事が削除された後も読んだ記録は残ります</span>
        <button
          type="button"
          onClick={() => clear()}
          className="shrink-0 rounded px-1.5 py-0.5 opacity-60 transition-colors duration-150 hover:opacity-100 active:bg-black/10 dark:active:bg-white/10"
          disabled={entries.length === 0}
        >
          履歴を削除
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        {error && <p className="p-1 text-xs text-red-500">{error}</p>}
        {loading && entries.length === 0 ? (
          <p className="p-1 text-xs opacity-60">読み込み中...</p>
        ) : entries.length === 0 ? (
          <StatePanel
            icon={<ClockIcon className="h-7 w-7" />}
            title="まだ履歴がありません"
            detail="記事を開くと、読んだ記録がここに残ります"
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li key={entry.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpen(entry.link)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleOpen(entry.link);
                    }
                  }}
                  className="flex w-full cursor-pointer flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors duration-150 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10"
                >
                  <span className="truncate text-sm">{entry.title ?? entry.link ?? "(無題)"}</span>
                  <span className="truncate text-xs opacity-60">
                    {entry.feed_title} · {formatPublished(entry.read_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ScreenOverlay>
  );
}
