import { test } from "node:test";
import assert from "node:assert/strict";

test("two timeline stores accept their own overlapping refreshes", async () => {
  const pending: Array<(entries: unknown[]) => void> = [];
  Object.assign(globalThis, {
    localStorage: { getItem: () => null, setItem: () => {} },
    window: {
      __TAURI_INTERNALS__: {
        invoke: (command: string) => {
          assert.equal(command, "list_entries");
          return new Promise((resolve) => pending.push(resolve));
        },
      },
    },
  });
  const { createEntriesStore } = await import("../src/stores/entriesStore.ts");
  const left = createEntriesStore();
  const right = createEntriesStore();
  const first = left.getState().refresh();
  const second = right.getState().refresh();
  pending[1]([{ id: 2 }]);
  await second;
  pending[0]([{ id: 1 }]);
  await first;

  assert.deepEqual(left.getState().entries.map((entry) => entry.id), [1]);
  assert.deepEqual(right.getState().entries.map((entry) => entry.id), [2]);
  assert.equal(left.getState().loading, false);
  assert.equal(right.getState().loading, false);
});
