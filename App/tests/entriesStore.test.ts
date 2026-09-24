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

test("marking an entry read updates the other pane without reloading its list", async () => {
  const commands: string[] = [];
  const entry = { id: 7, is_read: false };
  Object.assign(globalThis, {
    localStorage: { getItem: () => null, setItem: () => {} },
    window: {
      __TAURI_INTERNALS__: {
        invoke: async (command: string) => {
          commands.push(command);
          if (command === "list_entries") return [{ ...entry }];
          assert.equal(command, "mark_entry_read");
          return null;
        },
      },
    },
  });
  const { createEntriesStore } = await import("../src/stores/entriesStore.ts");
  const left = createEntriesStore();
  const right = createEntriesStore();
  await Promise.all([left.getState().refresh(), right.getState().refresh()]);
  commands.length = 0;

  await left.getState().markRead(7, true);

  assert.deepEqual(commands, ["mark_entry_read"]);
  assert.equal(left.getState().entries[0].is_read, true);
  assert.equal(right.getState().entries[0].is_read, true);
  assert.equal(right.getState().loading, false);
});
