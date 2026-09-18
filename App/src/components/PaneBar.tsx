import { usePanesStore } from "../stores/panesStore";

// Timeline pane management strip: add/close the second pane and choose the
// split direction. Always rendered above the timeline so the controls are in
// one place. Single-pane rendering underneath is unchanged.
export function PaneBar() {
  const dual = usePanesStore((s) => s.dual);
  const direction = usePanesStore((s) => s.direction);
  const toggleDual = usePanesStore((s) => s.toggleDual);
  const setDirection = usePanesStore((s) => s.setDirection);

  return (
    <div className="pane-bar flex shrink-0 flex-wrap items-center gap-1 border-b border-black/10 px-2 py-0.5 text-[11px] dark:border-white/10">
      <button
        type="button"
        onClick={toggleDual}
        title={dual ? "2つ目のタイムラインを閉じる" : "タイムラインを並べて表示する（最大2つ）"}
        className="min-h-6 shrink-0 rounded px-1.5 py-0.5 opacity-70 transition-colors duration-150 hover:bg-black/5 hover:opacity-100 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10"
      >
        {dual ? "1つに戻す" : "並べて表示"}
      </button>
      {dual && (
        <>
          <div className="segmented flex shrink-0 gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setDirection("row")}
              title="左右に並べる"
              className={`min-h-6 rounded px-1.5 py-0.5 transition-colors duration-150 ${
                direction === "row" ? "accent-bg-soft accent-text font-medium" : "opacity-60 hover:opacity-100"
              }`}
            >
              左右
            </button>
            <button
              type="button"
              onClick={() => setDirection("column")}
              title="上下に並べる"
              className={`min-h-6 rounded px-1.5 py-0.5 transition-colors duration-150 ${
                direction === "column" ? "accent-bg-soft accent-text font-medium" : "opacity-60 hover:opacity-100"
              }`}
            >
              上下
            </button>
          </div>
          <span className="pane-hint truncate opacity-50">
            各ペインの絞り込みは独立。上部の検索・ブクマは左（上）のペイン用です
          </span>
        </>
      )}
    </div>
  );
}
