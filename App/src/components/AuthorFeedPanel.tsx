import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useFeedsStore } from "../stores/feedsStore";
import { formatPublished } from "../lib/text";
import type { AuthorArticlePreview, AuthorFeedPreview } from "../lib/types";
import { CloseIcon, RssIcon } from "./icons";

interface AuthorFeedPanelProps {
  articleUrl: string;
  currentUrl?: string;
  onClose: () => void;
  onSelectArticle: (article: AuthorArticlePreview, feedTitle: string) => void;
}

export function AuthorFeedPanel({
  articleUrl,
  currentUrl,
  onClose,
  onSelectArticle,
}: AuthorFeedPanelProps) {
  const feeds = useFeedsStore((s) => s.feeds);
  const addFeed = useFeedsStore((s) => s.addFeed);
  const [preview, setPreview] = useState<AuthorFeedPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    setRegistered(false);
    void invoke<AuthorFeedPreview>("preview_author_feed", { url: articleUrl })
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleUrl]);

  const alreadySubscribed =
    registered ||
    (!!preview && feeds.some((f) => f.url === preview.feed_url));

  async function handleSubscribe() {
    if (!preview || alreadySubscribed || registering) return;
    setRegistering(true);
    try {
      await addFeed(preview.feed_url);
      setRegistered(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="panel-bg absolute inset-0 z-30 flex flex-col p-3">
      <div className="flex items-center justify-between gap-2 border-b border-black/10 pb-2 dark:border-white/10">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {preview ? `${preview.feed_title}` : "著者・サイトの記事一覧"}
          </div>
          {preview && (
            <div className="truncate text-[10px] opacity-60">{preview.feed_url}</div>
          )}
        </div>
        {preview && (
          <button
            type="button"
            onClick={() => void handleSubscribe()}
            disabled={alreadySubscribed || registering}
            className="accent-bg-soft accent-text flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-opacity duration-150 hover:opacity-80 disabled:opacity-50"
          >
            <RssIcon className="h-3.5 w-3.5" />
            {alreadySubscribed ? "登録済み" : registering ? "登録中..." : "RSS登録"}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center gap-1 rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
        >
          <CloseIcon className="h-3 w-3" />
          閉じる
        </button>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {loading && <p className="py-4 text-center text-xs opacity-60">記事一覧を取得中...</p>}
        {error && <p className="py-2 text-xs text-red-500">{error}</p>}
        {preview && preview.articles.length === 0 && (
          <p className="py-4 text-center text-xs opacity-60">記事が見つかりませんでした</p>
        )}
        {preview && preview.articles.length > 0 && (
          <ul className="flex flex-col gap-1">
            {preview.articles.map((article) => {
              const isCurrent = currentUrl === article.url;
              return (
                <li key={article.url}>
                  <button
                    type="button"
                    onClick={() => onSelectArticle(article, preview.feed_title)}
                    className={`entry-card flex w-full flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition duration-150 active:scale-[0.98] ${
                      isCurrent
                        ? "accent-border accent-bg-soft"
                        : "border-black/5 bg-black/[0.03] hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07]"
                    }`}
                  >
                    <div className="text-xs font-medium leading-snug">{article.title}</div>
                    {article.summary && (
                      <p className="line-clamp-2 text-[11px] opacity-70">{article.summary}</p>
                    )}
                    {article.published_at && (
                      <div className="text-[10px] opacity-55 tabular-nums">
                        {formatPublished(article.published_at)}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
