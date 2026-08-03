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
