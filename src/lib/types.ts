// Mirrors src-tauri/src/db/models.rs (serde default: field names as-is, snake_case).
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
}

// Mirrors src-tauri/src/db/models.rs::Entry.
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
}

// Mirrors src-tauri/src/commands/opml.rs::OpmlImportSummary.
export interface OpmlImportSummary {
  added: number;
  skipped: number;
}

// Mirrors src-tauri/src/db/models.rs::ReadHistoryEntry.
export interface ReadHistoryEntry {
  id: number;
  feed_title: string;
  title: string | null;
  link: string | null;
  read_at: string;
}
