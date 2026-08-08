// Resolves "which file/line created this DOM element" for the editor
// overlay's element picker, using React 19's dev-mode fiber internals.
//
// Confirmed against this project's exact toolchain (Vite + React 19) before
// building the rest of the overlay around it -- see the plan this was built
// from for how that was checked. React 19 dropped the older `_debugSource`
// object in favor of `_debugStack`, a real `Error` captured at JSX-creation
// time (`jsxDEV`); its `.stack` string contains the originating file/line
// like any other JS stack trace, so this just needs to find the first frame
// pointing at this project's own source (as opposed to React/Vite internals).
//
// Not a public API -- these fields are undocumented and could change in a
// future React version. If they ever disappear, `resolveElementSource`
// simply returns `null` and callers fall back to a generic label instead of
// throwing (see EditorOverlay.tsx).

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

const SOURCE_FRAME_RE = /\/(src\/[^\s:?")]+\.tsx?):(\d+):(\d+)/;

interface FiberLike {
  _debugStack?: { stack?: string };
}

function findFiber(node: Element): FiberLike | null {
  const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
  if (!fiberKey) return null;
  return (node as unknown as Record<string, FiberLike>)[fiberKey] ?? null;
}

export function resolveElementSource(node: Element): SourceLocation | null {
  const fiber = findFiber(node);
  const stack = fiber?._debugStack?.stack;
  if (!stack) return null;
  for (const line of stack.split("\n")) {
    const match = line.match(SOURCE_FRAME_RE);
    if (match) {
      return { file: match[1], line: Number(match[2]), column: Number(match[3]) };
    }
  }
  return null;
}

export function formatSourceLocation(loc: SourceLocation | null): string {
  return loc ? `${loc.file}:${loc.line}` : "（出どころ不明 -- data-ui-id が必要な箇所かもしれません）";
}
