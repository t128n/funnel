import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	isNavActive,
	overflowDestination,
	OVERFLOW_NAV,
	type NavUrl
} from '#lib/components/shell/navigation';
import { menuFocusIndex } from '#lib/components/shell/dropdown-menu';
import { GLOBAL_SEARCH_LIMIT, globalSearchUrl } from '#lib/components/shell/global-search';

const root = join(import.meta.dir, '..');

function source(path: string): string {
	return readFileSync(join(root, path), 'utf8');
}

function url(pathname: string, query = ''): NavUrl {
	return { pathname, searchParams: new URLSearchParams(query) };
}

describe('overflow navigation', () => {
	test('marks the More toggle current for every overflow destination', () => {
		expect(overflowDestination(url('/issues', '?assignee=me'))?.label).toBe('My Issues');
		expect(overflowDestination(url('/attention'))?.label).toBe('Attention');
		expect(overflowDestination(url('/epics'))?.label).toBe('Epics');
		expect(overflowDestination(url('/milestones'))?.label).toBe('Milestones');
	});

	test('does not treat primary destinations as overflow', () => {
		for (const path of ['/issues', '/inbox', '/board', '/matrix', '/plan', '/timeline']) {
			expect(overflowDestination(url(path))).toBeNull();
		}
		expect(overflowDestination(url('/issues/demo/funnel/1'))).toBeNull();
	});

	test('keeps My Issues and Issues mutually exclusive', () => {
		const mine = OVERFLOW_NAV.find((destination) => destination.label === 'My Issues');
		const issues = { href: '/issues', label: 'Issues', icon: '', match: '/issues' };
		expect(mine && isNavActive(mine, url('/issues', '?assignee=me'))).toBe(true);
		expect(isNavActive(issues, url('/issues', '?assignee=me'))).toBe(false);
		expect(isNavActive(issues, url('/issues'))).toBe(true);
	});
});

describe('navbar dropdown keyboard movement', () => {
	test('ArrowDown enters a closed menu at the first item and wraps', () => {
		expect(menuFocusIndex('ArrowDown', -1, 4)).toBe(0);
		expect(menuFocusIndex('ArrowDown', 2, 4)).toBe(3);
		expect(menuFocusIndex('ArrowDown', 3, 4)).toBe(0);
	});

	test('ArrowUp enters at the last item and wraps', () => {
		expect(menuFocusIndex('ArrowUp', -1, 4)).toBe(3);
		expect(menuFocusIndex('ArrowUp', 0, 4)).toBe(3);
		expect(menuFocusIndex('ArrowUp', 2, 4)).toBe(1);
	});

	test('Home and End jump to the edges', () => {
		expect(menuFocusIndex('Home', 2, 4)).toBe(0);
		expect(menuFocusIndex('End', 1, 4)).toBe(3);
	});

	test('non-menu keys and empty menus do nothing', () => {
		expect(menuFocusIndex('Tab', 0, 4)).toBeNull();
		expect(menuFocusIndex('Escape', 0, 4)).toBeNull();
		expect(menuFocusIndex('ArrowDown', -1, 0)).toBeNull();
	});
});

describe('global search surface', () => {
	test('queries the issues feed without a repository scope', () => {
		expect(globalSearchUrl('postgres')).toBe(
			`/api/feeds/issues?limit=${GLOBAL_SEARCH_LIMIT}&q=postgres`
		);
		expect(globalSearchUrl('  deploy signing  ')).toContain('q=deploy+signing');
		expect(globalSearchUrl('postgres')).not.toContain('repo=');
	});

	test('still loads recent issues for an empty query', () => {
		expect(globalSearchUrl('')).toBe(`/api/feeds/issues?limit=${GLOBAL_SEARCH_LIMIT}`);
	});

	test('the shell mounts one panel, not page-local focus routing', () => {
		const appBar = source('src/lib/components/shell/AppBar.svelte');
		const appShell = source('src/lib/components/shell/AppShell.svelte');
		const layout = source('src/routes/(app)/+layout.svelte');
		const panel = source('src/lib/components/shell/GlobalSearch.svelte');

		expect(appBar).toContain('id="global-search-trigger"');
		expect(appShell).toContain('<GlobalSearch');
		expect(layout).toContain("hotkeys.current['nav.search'], callback: openSearch");
		expect(layout).toContain("hotkeys.current['nav.search-slash'], callback: focusLocalSearch");
		expect(layout).not.toContain("goto('/issues')");
		expect(panel).toContain('globalSearchUrl');
		expect(panel).toContain('data-global-search-result');
		expect(panel).toContain("event.key === 'Escape'");
		expect(panel).toContain("event.key === 'Enter'");
	});

	test('placeholders match the implemented title/body/comment search', () => {
		const feedSearch = source('src/lib/components/filter/FeedSearch.svelte');
		const inbox = source('src/routes/(app)/inbox/+page.svelte');
		expect(feedSearch).not.toContain('issue ID');
		expect(inbox).not.toContain('issue ID');
		expect(feedSearch).toContain('Search title, body, or comments');
	});
});

describe('shell navigation structure', () => {
	const appBar = source('src/lib/components/shell/AppBar.svelte');
	const appShell = source('src/lib/components/shell/AppShell.svelte');
	const layout = source('src/routes/(app)/+layout.svelte');

	test('removes the repository scope control and its prop plumbing', () => {
		expect(appBar).not.toContain('Repository scope');
		expect(appBar).not.toContain('setRepo');
		expect(appShell).not.toContain('repos?: string[]');
		expect(layout).not.toContain('repos={data.options.repos');
	});

	test('every collapsed-menu navigation closes the menu', () => {
		expect(appBar).toContain('onclick={closeNav}');
		expect(appBar).toContain('function openSettings');
		expect(appBar).toContain('closeNav();\n\t\tvoid goto(path)');
		expect(appBar).toContain('on:click={closeNav}');
	});

	test('uses the shared dropdown wrapper and exposes radio selection', () => {
		expect(appBar.match(/<NavDropdown>/g)?.length).toBe(3);
		expect(appBar).toContain('role="menuitemradio"');
		expect(appBar).toContain('aria-checked={$themeChoice === theme.value}');
		expect(appBar).toContain('More destinations, current:');
	});
});
