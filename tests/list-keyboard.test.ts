import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
	isTypingTarget,
	listKeyAction,
	listRowAnnouncement,
	nextListIndex,
	type ListKeyAction
} from '#lib/client/list-keyboard';

/** Minimal duck-typed event target for the input guard. */
function fieldLike(typing: boolean): EventTarget {
	return {
		closest: () => (typing ? ({} as Element) : null)
	} as unknown as EventTarget;
}

function key(
	value: string,
	options: { typing?: boolean; mayWrite?: boolean } = {}
): ListKeyAction | null {
	return listKeyAction(
		{
			key: value,
			target: fieldLike(options.typing ?? false),
			defaultPrevented: false,
			ctrlKey: false,
			metaKey: false,
			altKey: false
		},
		{ mayWrite: options.mayWrite ?? true }
	);
}

describe('list input guards', () => {
	test('fields own their keys', () => {
		expect(isTypingTarget(fieldLike(true))).toBe(true);
		expect(isTypingTarget(fieldLike(false))).toBe(false);
		expect(isTypingTarget(null)).toBe(false);

		for (const value of ['j', 'k', 'x', 's', 'c', 'Enter', 'Escape']) {
			expect(key(value, { typing: true })).toBeNull();
		}
	});

	test('modifier combinations are left to the browser', () => {
		const event = {
			key: 'j',
			target: fieldLike(false),
			defaultPrevented: false,
			ctrlKey: true,
			metaKey: false,
			altKey: false
		};
		expect(listKeyAction(event, { mayWrite: true })).toBeNull();
	});

	test('already-handled events are ignored', () => {
		const event = {
			key: 'j',
			target: fieldLike(false),
			defaultPrevented: true,
			ctrlKey: false,
			metaKey: false,
			altKey: false
		};
		expect(listKeyAction(event, { mayWrite: true })).toBeNull();
	});
});

describe('list key mapping', () => {
	test('j/k and the arrows move between rows', () => {
		expect(key('j')).toEqual({ type: 'move', to: 'next' });
		expect(key('ArrowDown')).toEqual({ type: 'move', to: 'next' });
		expect(key('k')).toEqual({ type: 'move', to: 'previous' });
		expect(key('ArrowUp')).toEqual({ type: 'move', to: 'previous' });
		expect(key('Home')).toEqual({ type: 'move', to: 'first' });
		expect(key('End')).toEqual({ type: 'move', to: 'last' });
	});

	test('Enter opens and Escape dismisses', () => {
		expect(key('Enter')).toEqual({ type: 'open' });
		expect(key('Escape')).toEqual({ type: 'dismiss' });
	});

	test('write actions are gated by role', () => {
		expect(key('x')).toEqual({ type: 'toggle' });
		expect(key('X')).toEqual({ type: 'toggle' });
		expect(key('s')).toEqual({ type: 'status' });
		expect(key('c')).toEqual({ type: 'create' });

		expect(key('x', { mayWrite: false })).toBeNull();
		expect(key('s', { mayWrite: false })).toBeNull();
		expect(key('c', { mayWrite: false })).toBeNull();
	});

	test('read-only viewers can still navigate and dismiss', () => {
		expect(key('j', { mayWrite: false })).toEqual({ type: 'move', to: 'next' });
		expect(key('Enter', { mayWrite: false })).toEqual({ type: 'open' });
		expect(key('Escape', { mayWrite: false })).toEqual({ type: 'dismiss' });
	});
});

describe('list index boundaries', () => {
	test('next enters at the first row and clamps at the last', () => {
		expect(nextListIndex('next', -1, 4)).toBe(0);
		expect(nextListIndex('next', 0, 4)).toBe(1);
		expect(nextListIndex('next', 3, 4)).toBe(3);
	});

	test('previous enters at the last row and clamps at the first', () => {
		expect(nextListIndex('previous', -1, 4)).toBe(3);
		expect(nextListIndex('previous', 0, 4)).toBe(0);
		expect(nextListIndex('previous', 2, 4)).toBe(1);
	});

	test('Home and End reach the edges', () => {
		expect(nextListIndex('first', 2, 4)).toBe(0);
		expect(nextListIndex('last', 1, 4)).toBe(3);
	});

	test('empty lists have no row to focus', () => {
		expect(nextListIndex('next', -1, 0)).toBeNull();
		expect(nextListIndex('first', 0, 0)).toBeNull();
	});
});

describe('row announcements', () => {
	test('include the position, total, and row label', () => {
		expect(listRowAnnouncement(0, 3, 'CORE-1: Fix login')).toBe(
			'Row 1 of 3: CORE-1: Fix login'
		);
		expect(listRowAnnouncement(2, 3, '  ')).toBe('Row 3 of 3');
	});
});

describe('table wiring', () => {
	const root = new URL('..', import.meta.url);
	const source = (path: string) => readFileSync(new URL(path, root), 'utf8');

	test('both tables use the shared roving keyboard contract', () => {
		for (const path of [
			'src/lib/components/issue/IssueTable.svelte',
			'src/lib/components/inbox/InboxTable.svelte'
		]) {
			const table = source(path);
			expect(table).toContain('listKeyAction');
			expect(table).toContain('nextListIndex');
			expect(table).toContain('data-list-row');
			expect(table).toContain('data-list-link');
			expect(table).toContain('tabindex={');
			expect(table).toContain('onfocusin={onRowFocus}');
			expect(table).toContain('aria-live="polite"');
			expect(table).toContain('clearBulkSelection');
			expect(table).toContain('openQuickCreate');
		}
		expect(source('src/lib/components/inbox/InboxTable.svelte')).toContain('data-list-status');
		expect(source('src/lib/components/issue/IssueTable.svelte')).toContain('data-list-status');
	});
});
