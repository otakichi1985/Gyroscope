import type { Entry } from "./types";

export type EntryLamp = "fresh" | "unread" | "read";

export const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

export const ENTRY_LAMP_LABEL: Record<EntryLamp, string> = {
  fresh: "24時間以内の新着",
  unread: "未読",
  read: "既読",
};

export function getEntryLamp(
  entry: Pick<Entry, "is_read" | "published_at">,
  nowMs: number = Date.now(),
): EntryLamp {
  if (!entry.is_read) {
    if (entry.published_at) {
      const publishedMs = Date.parse(entry.published_at);
      if (!Number.isNaN(publishedMs) && nowMs - publishedMs < FRESH_WINDOW_MS) {
        return "fresh";
      }
    }
    return "unread";
  }
  return "read";
}
