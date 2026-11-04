import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { focusables, isVisibleFocusTarget, wrapTabIndex } from '#lib/client/modal-focus';

const root = join(import.meta.dir, '..');

function source(path: string): string {
	return readFileSync(join(root, path), 'utf8');
}

function fakeTarget(rects: number, disabled = false): HTMLElement {
	return {
		disabled,
		getClientRects: () => new Array(rects).fill({})
	} as unknown as HTMLElement;
}

describe('dialog focus trap', () => {
	test('wraps forward from the last control to the first', () => {
		expect(wrapTabIndex(3, 2, false)).toBe(0);
		expect(wrapTabIndex(1, 0, false)).toBe(0);
	});

	test('wraps backward from the first control to the last', () => {
		expect(wrapTabIndex(3, 0, true)).toBe(2);
		expect(wrapTabIndex(1, 0, true)).toBe(0);
	});

	test('leaves traversal inside the dialog to the browser', () => {
		expect(wrapTabIndex(3, 1, false)).toBe(-1);
		expect(wrapTabIndex(3, 1, true)).toBe(-1);
	});

	test('never requests a target when the dialog has no controls', () => {
		expect(wrapTabIndex(0, -1, false)).toBe(-1);
		expect(wrapTabIndex(0, -1, true)).toBe(-1);
	});
});

describe('dialog focus candidates', () => {
	test('skips hidden and disabled controls', () => {
		expect(isVisibleFocusTarget(fakeTarget(1))).toBe(true);
		expect(isVisibleFocusTarget(fakeTarget(0))).toBe(false);
		expect(isVisibleFocusTarget(fakeTarget(1, true))).toBe(false);
	});

	test('collects only rendered controls from a scope', () => {
		const visible = fakeTarget(1);
		const hidden = fakeTarget(0);
		const scope = {
			querySelectorAll: () => [visible, hidden]
		} as unknown as ParentNode;
		expect(focusables(scope)).toEqual([visible]);
	});
});

describe('dialog focus manager integration', () => {
	test('the root layout starts it once for the whole app', () => {
		const layout = source('src/routes/+layout.svelte');
		expect(layout).toContain("import { initDialogFocus } from '#lib/client/modal-focus'");
		expect(layout).toContain('initDialogFocus()');
	});

	test('every dialog is marked modal, trapped, and named', () => {
		const manager = source('src/lib/client/modal-focus.ts');
		expect(manager).toContain("dialog.setAttribute('aria-modal', 'true')");
		expect(manager).toContain('.modal-title');
		expect(manager).toContain("event.key !== 'Tab'");
		expect(manager).toContain('wrapTabIndex');
	});

	test('the page behind the dialog is inert and focus is returned', () => {
		const manager = source('src/lib/client/modal-focus.ts');
		expect(manager).toContain('child.inert = true');
		expect(manager).toContain('function scheduleRestore');
		expect(manager).toContain('returnTarget(previous)');
	});
});
