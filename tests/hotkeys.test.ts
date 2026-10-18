import { describe, expect, test } from "bun:test";
import { areHotkeysEqual, validateHotkey } from "@tanstack/hotkeys";
import { appHotkeys } from "#lib/client/hotkeys";

// `findHotkeyConflicts` needs a live registry (a DOM), so this suite guards the
// catalog statically instead: every default must be a valid hotkey, and no two
// actions may claim the same binding. Runtime collisions still surface through
// TanStack's default `conflictBehavior: 'warn'`.
const bound = Object.entries(appHotkeys).flatMap(([id, hotkey]) =>
  hotkey.hotkey === null ? [] : [{ id, hotkey: hotkey.hotkey }],
);

describe("app hotkey catalog", () => {
  test("every default binding is a valid hotkey", () => {
    for (const { id, hotkey } of bound) {
      const { valid, errors } = validateHotkey(hotkey);
      expect({ id, valid, errors }).toEqual({ id, valid: true, errors: [] });
    }
  });

  test("no two actions share a binding", () => {
    for (let i = 0; i < bound.length; i += 1) {
      for (let j = i + 1; j < bound.length; j += 1) {
        const left = bound[i];
        const right = bound[j];
        expect({
          pair: [left.id, right.id],
          equal: areHotkeysEqual(left.hotkey, right.hotkey),
        }).toEqual({ pair: [left.id, right.id], equal: false });
      }
    }
  });
});
