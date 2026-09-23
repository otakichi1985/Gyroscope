export interface Feed {
  id: number;
  url: string;
  site_url: string | null;
  title: string | null;
  custom_title: string | null;
  icon_path: string | null;
  folder: string | null;
  interval_min: number | null;
  notify_enabled: boolean;
  sort_order: number;
  last_fetched_at: string | null;
  last_error: string | null;
  created_at: string;
  tags: string[];
  unread_count: number;
  source_type: "rss" | "booth";
}

export interface Entry {
  id: number;
  feed_id: number;
  guid: string;
  title: string | null;
  link: string | null;
  author: string | null;
  summary: string | null;
  content_html: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  fetched_at: string;
  is_read: boolean;
  is_starred: boolean;
  deleted_at: string | null;
}

export interface OpmlImportSummary {
  added: number;
  skipped: number;
}

export interface ReadHistoryEntry {
  id: number;
  feed_title: string;
  title: string | null;
  link: string | null;
  read_at: string;
}

export interface ScoredSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  published_at: string | null;
  feed_url: string | null;
  feed_available: boolean;
  thumbnail_url: string | null;
  bookmark_count: number;
  score: number;
  reasons: string[];
}

export interface SearchCategory {
  slug: string;
  label: string;
}

export interface DataDirInfo {
  path: string;
  is_portable: boolean;
  is_custom: boolean;
  default_path: string;
  fallback_reason: string | null;
}
