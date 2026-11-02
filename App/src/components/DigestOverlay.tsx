import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ScreenOverlay } from "./ScreenOverlay";
import { useUiStore } from "../stores/uiStore";
import { useAppearanceStore } from "../stores/appearanceStore";
import { refreshAllEntriesStores } from "../stores/entriesStore";
import { useSmoothWheelScroll } from "../hooks/useSmoothWheelScroll";
import { useScrollTargetRef } from "../hooks/useScrollTargetRef";
import { ExternalLinkIcon, StarIcon } from "./icons";

interface DigestItem {
  id: number;
  title: string;
  url: string;
  site: string;
  folder: string | null;
  published_at: string | null;
  thumbnail: string | null;
  star: boolean;
  note: string;
  summary: string;
}

interface DigestSection {
  name: string;
  gist: string;
  items: DigestItem[];
}

interface DigestData {
  date: string;
  source: { total: number; kept: number; dropped: number };
  sections: DigestSection[];
  dropped: { title: string; reason: string }[];
  trend: {
    folders: Record<string, number>;
    sites: Record<string, number>;
    words: Record<string, number>;
  };
}

function breakdown(data: Record<string, number>, label: string) {
  const entries = Object.entries(data).slice(0, 6);
  if (entries.length === 0) return null;
  return (
    <div key={label} className="text-[11px] leading-5">
      <span className="opacity-50">{label}: </span>
      <span className="opacity-75">{entries.map(([key, value]) => `${key} ${value}`).join(" / ")}</span>
    </div>
  );
}

export function DigestOverlay() {
  const isActive = useUiStore((s) => s.activeScreen === "digest");
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

  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>("");
  const [data, setData] = useState<DigestData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dir, setDir] = useState("");
  const clickBehavior = useAppearanceStore((s) => s.clickBehavior);

  // JSON は生成時点の状態なので、この画面で押した結果は手元で持つ。
  const [starred, setStarred] = useState<Record<number, boolean>>({});
  const [readIds, setReadIds] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [list, path] = await Promise.all([
          invoke<string[]>("list_digests"),
          invoke<string>("digest_dir_path"),
        ]);
        if (cancelled) return;
        setDates(list);
        setDir(path);
        const next = date && list.includes(date) ? date : (list[0] ?? "");
        setDate(next);
        setData(next ? JSON.parse(await invoke<string>("read_digest", { date: next })) : null);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // date は選択時に個別に読むので、ここでは起点だけ見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const pickDate = async (next: string) => {
    setDate(next);
    setLoading(true);
    setError("");
    try {
      setData(JSON.parse(await invoke<string>("read_digest", { date: next })));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const openItem = (item: DigestItem) => {
    setReadIds((prev) => ({ ...prev, [item.id]: true }));
    if (item.id > 0) {
      void invoke("mark_entry_read", { id: item.id, isRead: true })
        .then(() => refreshAllEntriesStores())
        .catch(() => {});
    }
    if (clickBehavior === "reader" && item.id > 0) {
      useUiStore.getState().openReader(item.id);
      return;
    }
    void openUrl(item.url);
  };

  const toggleStar = async (item: DigestItem) => {
    const next = !(starred[item.id] ?? item.star);
    setStarred((prev) => ({ ...prev, [item.id]: next }));
    try {
      await invoke("toggle_star", { id: item.id, isStarred: next });
      refreshAllEntriesStores();
    } catch (err) {
      setStarred((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      setError(String(err));
    }
  };

  return (
    <ScreenOverlay screen="digest" title={data ? `ダイジェスト ${data.date}` : "ダイジェスト"}>
      <div className="flex shrink-0 items-center gap-2 border-b border-black/10 px-2 py-1 text-[11px] dark:border-white/10">
        {dates.length > 1 &&
          dates.slice(0, 5).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => void pickDate(d)}
              className={`rounded px-1.5 py-0.5 transition-colors duration-150 ${
                d === date ? "bg-black/10 dark:bg-white/15" : "opacity-60 hover:opacity-100"
              }`}
            >
              {d.slice(5)}
            </button>
          ))}
        {data && (
          <span className="ml-auto opacity-60">
            {data.source.total}件中 {data.source.kept}件を採用
          </span>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm">
        {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
        {loading && <p className="text-xs opacity-60">読み込み中...</p>}

        {!loading && !data && !error && (
          <div className="px-1 py-6 text-xs leading-6 opacity-70">
            <p className="mb-1 font-medium opacity-100">ダイジェストがありません</p>
            <p className="break-all">
              <span className="opacity-60">{dir}</span>
            </p>
            <p className="mt-2">ここに YYYY-MM-DD.json を置くと、この画面に出ます。</p>
          </div>
        )}

        {data && (
          <>
            {data.sections.map((section) => (
              <section key={section.name} className="mb-4">
                <h3 className="mb-1 flex items-baseline gap-2 text-sm font-semibold">
                  {section.name}
                  <span className="text-[10px] font-normal opacity-50">{section.items.length}件</span>
                </h3>
                {section.gist && <p className="mb-2 text-[11px] leading-5 opacity-60">{section.gist}</p>}
                <ul>
                  {section.items.map((item) => {
                    const isStarred = starred[item.id] ?? item.star;
                    const isRead = readIds[item.id] ?? false;
                    return (
                      <li
                        key={item.id}
                        className="flex items-start gap-2.5 border-t border-black/10 px-1 py-2.5 transition-colors duration-150 first:border-t-0 hover:bg-black/[0.035] dark:border-white/10 dark:hover:bg-white/[0.045]"
                      >
                        {item.thumbnail && (
                          <img
                            src={item.thumbnail}
                            alt=""
                            loading="lazy"
                            className="h-11 w-16 shrink-0 rounded object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => openItem(item)}
                            className={`block text-left text-[13px] font-medium leading-5 hover:underline ${
                              isRead ? "opacity-55" : ""
                            }`}
                          >
                            {item.title}
                          </button>
                          <div className="text-[10px] opacity-50">
                            {item.site}
                            {isStarred && (
                              <span className="ml-1.5 text-amber-600 dark:text-amber-400">★推し</span>
                            )}
                            {isRead && <span className="ml-1.5">既読</span>}
                          </div>
                          {item.note && <div className="mt-0.5 text-[11px] leading-5 opacity-75">{item.note}</div>}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => void toggleStar(item)}
                            aria-pressed={isStarred}
                            title={isStarred ? "ブックマークを外す" : "ブックマークに追加"}
                            className={`rounded p-1 transition-colors duration-150 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 ${
                              isStarred
                                ? "text-amber-600 opacity-100 dark:text-amber-400"
                                : "opacity-40 hover:opacity-100"
                            }`}
                          >
                            <StarIcon filled={isStarred} className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void openUrl(item.url)}
                            title="ブラウザで開く"
                            className="rounded p-1 opacity-40 transition-colors duration-150 hover:bg-black/5 hover:opacity-100 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15"
                          >
                            <ExternalLinkIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {data.dropped.length > 0 && (
              <details className="mt-2 border-t border-black/10 pt-2 dark:border-white/10">
                <summary className="cursor-pointer text-[11px] opacity-60">
                  除外した {data.dropped.length}件
                </summary>
                <ul className="mt-1">
                  {data.dropped.map((row) => (
                    <li key={row.title} className="py-0.5 text-[11px] opacity-50">
                      {row.title} — {row.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <details className="mt-2 border-t border-black/10 pt-2 dark:border-white/10">
              <summary className="cursor-pointer text-[11px] opacity-60">今日の内訳</summary>
              <div className="mt-1">
                {breakdown(data.trend.folders, "ジャンル")}
                {breakdown(data.trend.sites, "サイト")}
                {breakdown(data.trend.words, "よく出た語")}
              </div>
            </details>
          </>
        )}
      </div>
    </ScreenOverlay>
  );
}
