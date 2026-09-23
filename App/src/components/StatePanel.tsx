import type { ReactNode } from "react";

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
    <div className="state-panel flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <div className={tone === "error" ? "text-red-500" : "accent-text opacity-70"}>{icon}</div>
      <p className={`text-sm ${tone === "error" ? "text-red-500" : "opacity-80"}`}>{title}</p>
      {detail && <p className="max-w-[34ch] text-xs leading-relaxed opacity-60">{detail}</p>}
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
