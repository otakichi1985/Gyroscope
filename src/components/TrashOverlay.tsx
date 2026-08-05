import { useEffect } from "react";
import { formatPublished } from "../lib/text";
import { useTrashStore } from "../stores/trashStore";
import { useUiStore } from "../stores/uiStore";
import { ScreenOverlay } from "./ScreenOverlay";
import { StatePanel } from "./StatePanel";
import { TrashIcon } from "./icons";

export function TrashOverlay() {
  const isActive = useUiStore((s) => s.activeScreen === "trash");
  const { entries, loading, error, refresh, restore } = useTrashStore();

  // Re-fetch on every activation, not just first mount: this component
  // stays mounted for the app's lifetime (see ScreenOverlay), so a
  // mount-only fetch would keep showing whatever snapshot existed at
  // startup.
  useEffect(() => {
    if (isActive) refresh();
  }, [isActive, refresh]);

  return (
    <ScreenOverlay screen="trash" title="ゴミ箱">
      <div className="shrink-0 border-b border-black/10 px-2 py-1 text-xs opacity-60 dark:border-white/10">
        削除したブックマークは30日間ここに残ります。その後は自動的に完全削除されます
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
        {error && <p className="p-1 text-xs text-red-500">{error}</p>}
        {loading && entries.length === 0 ? (
          <p className="p-1 text-xs opacity-60">読み込み中...</p>
        ) : entries.length === 0 ? (
          <StatePanel
            icon={<TrashIcon className="h-7 w-7" />}
            title="ゴミ箱は空です"
            detail="ブックマークを削除すると、30日間ここに保管されます"
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{entry.title ?? entry.link ?? "(無題)"}</div>
                  <div className="truncate text-xs opacity-60">
                    削除日時: {formatPublished(entry.deleted_at)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => restore(entry.id)}
                  className="shrink-0 rounded px-1.5 py-1 text-xs opacity-70 transition-colors duration-150 hover:opacity-100 active:bg-black/10 dark:active:bg-white/10"
                >
                  元に戻す
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ScreenOverlay>
  );
}
