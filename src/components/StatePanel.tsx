import type { ReactNode } from "react";

/**
 * The centred icon + message (+ optional call to action) used for every
 * "there is nothing here" / "this failed" state in the app.
 *
 * These were all bare one-line `<p>` tags ("読み込み中...", "記事がありません",
 * the raw error string). Beyond looking unfinished, the empty cases were
 * actively unhelpful: a fresh install showed "記事がありません" with no hint
 * that what was missing was *feeds*, or where to add them. Centralised here
 * so the wording can stay specific per screen while the framing stays
 * identical everywhere.
 */
export function StatePanel({
  icon,
  title,
  detail,
  action,
  tone = "muted",
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
  tone?: "muted" | "error";
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <div className={tone === "error" ? "text-red-500" : "accent-text opacity-50"}>{icon}</div>
      <p className={`text-sm ${tone === "error" ? "text-red-500" : "opacity-80"}`}>{title}</p>
      {detail && <p className="text-xs opacity-50">{detail}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="accent-bg mt-1 rounded px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90 active:opacity-80"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
