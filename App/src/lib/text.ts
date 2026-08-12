import type { Entry } from "./types";

/**
 * Extracts plain text from untrusted HTML via an inert DOMParser document
 * (no browsing context, so images never load and scripts never run) rather
 * than assigning to a live element's innerHTML.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function entrySnippet(
  entry: Pick<Entry, "summary" | "content_html">,
  maxLen = 140,
): string {
  const text = stripHtml(entry.summary) || stripHtml(entry.content_html);
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}…`;
}

export function formatPublished(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
