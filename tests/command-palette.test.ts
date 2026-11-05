import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
	buildPaletteCommands,
	filterPaletteCommands,
	paletteFocusIndex
} from '#lib/components/shell/commands';
import type { SavedView } from '#lib/saved-views';

function view(overrides: Partial<SavedView> = {}): SavedView {
	return {
		id: 'view-1',
		ownerUserId: 'user-1',
		name: 'My urgent work',
		query: 'priority=p1',
		scope: 'issues',
		sort: null,
		direction: null,
		group: null,
		shared: false,
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		...overrides
	};
}

describe('palette command catalog', () => {
	test('navigation stays available to read-only viewers', () => {
		const commands = buildPaletteCommands({ mayWrite: false });
		const labels = commands.map((command) => command.label);

		for (const label of [
			'Inbox',
			'Issues',
			'Board',
			'Attention',
			'Settings',
			'Plan',
			'Timeline'
		]) {
			expect(labels).toContain(label);
		}
		expect(commands.some((command) => command.action === 'create-issue')).toBe(false);
	});

	test('the create command only exists for writers', () => {
		const commands = buildPaletteCommands({ mayWrite: true });
		const create = commands.find((command) => command.action === 'create-issue');
		expect(create?.requiresWrite).toBe(true);
		expect(create?.group).toBe('Create');
	});

	test('saved views are read-only navigation commands', () => {
		const commands = buildPaletteCommands({
			mayWrite: false,
			savedViews: [view(), view({ id: 'view-2', name: 'Inbox later', scope: 'inbox' })]
		});
		const saved = commands.filter((command) => command.group === 'Saved views');

		expect(saved.map((command) => command.label)).toEqual(['Inbox later', 'My urgent work']);
		expect(saved.every((command) => command.requiresWrite === undefined)).toBe(true);
		expect(saved[1].href).toContain('/issues?');
		expect(saved[1].href).toContain('priority=p1');
		expect(saved[0].href).toContain('/inbox');
	});
});

describe('palette filtering', () => {
	const commands = buildPaletteCommands({
		mayWrite: true,
		savedViews: [view()]
	});

	test('an empty query keeps the full directory', () => {
		expect(filterPaletteCommands(commands, '   ')).toHaveLength(commands.length);
	});

	test('matches labels, group names and keywords case-insensitively', () => {
		expect(filterPaletteCommands(commands, 'BOARD').map((command) => command.label)).toEqual([
			'Board'
		]);
		expect(filterPaletteCommands(commands, 'settings').map((command) => command.label)).toEqual([
			'Settings'
		]);
		expect(
			filterPaletteCommands(commands, 'quick create').map((command) => command.label)
		).toEqual(['Create issue']);
		expect(
			filterPaletteCommands(commands, 'saved urgent').map((command) => command.label)
		).toEqual(['My urgent work']);
	});

	test('requires every term and drops non-matches', () => {
		expect(filterPaletteCommands(commands, 'board settings')).toEqual([]);
		expect(filterPaletteCommands(commands, 'nope')).toEqual([]);
	});
});

describe('palette selection', () => {
	test('arrows wrap and enter at the right edge', () => {
		expect(paletteFocusIndex('ArrowDown', -1, 3)).toBe(0);
		expect(paletteFocusIndex('ArrowDown', 2, 3)).toBe(0);
		expect(paletteFocusIndex('ArrowUp', -1, 3)).toBe(2);
		expect(paletteFocusIndex('ArrowUp', 0, 3)).toBe(2);
	});

	test('Home and End jump to the edges', () => {
		expect(paletteFocusIndex('Home', 2, 3)).toBe(0);
		expect(paletteFocusIndex('End', 0, 3)).toBe(2);
	});

	test('other keys and empty lists do nothing', () => {
		expect(paletteFocusIndex('Tab', 0, 3)).toBeNull();
		expect(paletteFocusIndex('Enter', 0, 3)).toBeNull();
		expect(paletteFocusIndex('ArrowDown', -1, 0)).toBeNull();
	});
});

describe('palette wiring', () => {
	const root = new URL('..', import.meta.url);
	const source = (path: string) =>
		readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');

	test('one Mod+K surface hosts commands and issue results', () => {
		const panel = source('src/lib/components/shell/GlobalSearch.svelte');
		expect(panel).toContain('buildPaletteCommands');
		expect(panel).toContain('filterPaletteCommands');
		expect(panel).toContain('data-palette-item');
		expect(panel).toContain('data-global-search-result');
		expect(panel).toContain('openQuickCreate');
		expect(panel).toContain("keyHint('list.dismiss')");
		expect(panel).toContain("keyHint('nav.search')");
	});

	test('the shell supplies role and saved views to the palette', () => {
		const shell = source('src/lib/components/shell/AppShell.svelte');
		const layout = source('src/routes/(app)/+layout.svelte');
		expect(shell).toContain('{mayWrite}');
		expect(shell).toContain('{savedViews}');
		expect(layout).toContain('mayWrite={mayWrite}');
		expect(layout).toContain('savedViews={data.savedViews}');
	});
});
