import { describe, expect, test } from 'bun:test';
import { EMPTY_CLIENT_FILTER, type ClientFilter } from '#lib/url-filter';
import {
	clearOwnedFilters,
	ownedFilterCount,
	ownsDimension,
	type DrawerScope
} from './drawer-filters';

const EVERYTHING_VISIBLE: DrawerScope = { hidden: new Set(), showState: true };

/** The Issues toolbar owns state/status/priority/assignee; the drawer owns the rest. */
const ISSUES_TOOLBAR: DrawerScope = {
	hidden: new Set(['state', 'status', 'priority', 'assignee']),
	showState: true
};

function filter(patch: Partial<ClientFilter>): ClientFilter {
	return { ...EMPTY_CLIENT_FILTER, ...patch };
}

describe('ownsDimension', () => {
	test('respects hidden dimensions and the optional state switch', () => {
		expect(ownsDimension('size', EVERYTHING_VISIBLE)).toBe(true);
		expect(ownsDimension('size', ISSUES_TOOLBAR)).toBe(true);
		expect(ownsDimension('status', ISSUES_TOOLBAR)).toBe(false);
		expect(ownsDimension('state', { hidden: new Set(), showState: false })).toBe(false);
	});
});

describe('ownedFilterCount / clearOwnedFilters', () => {
	test('a search term alone is neither counted nor cleared by the drawer', () => {
		const current = filter({ search: 'cockpit' });
		expect(ownedFilterCount(current, EVERYTHING_VISIBLE)).toBe(0);
		expect(clearOwnedFilters(current, EVERYTHING_VISIBLE).search).toBe('cockpit');
	});

	test('the badge counts exactly the dimensions Clear removes', () => {
		const current = filter({
			search: 'cockpit',
			sizes: ['sm'],
			labels: ['frontend']
		});
		expect(ownedFilterCount(current, EVERYTHING_VISIBLE)).toBe(2);

		const cleared = clearOwnedFilters(current, EVERYTHING_VISIBLE);
		expect(ownedFilterCount(cleared, EVERYTHING_VISIBLE)).toBe(0);
		expect(cleared.search).toBe('cockpit');
		expect(cleared.sizes).toEqual([]);
		expect(cleared.labels).toEqual([]);
	});

	test('hidden toolbar dimensions are preserved and not counted', () => {
		const current = filter({
			states: ['closed'],
			statuses: ['todo'],
			priorities: ['p1'],
			sizes: ['sm']
		});
		expect(ownedFilterCount(current, ISSUES_TOOLBAR)).toBe(1);

		const cleared = clearOwnedFilters(current, ISSUES_TOOLBAR);
		expect(cleared.states).toEqual(['closed']);
		expect(cleared.statuses).toEqual(['todo']);
		expect(cleared.priorities).toEqual(['p1']);
		expect(cleared.sizes).toEqual([]);
	});

	test('the me scope is preserved even when the drawer owns assignee', () => {
		const current = filter({ assignees: ['me', 'demo'] });
		expect(ownedFilterCount(current, EVERYTHING_VISIBLE)).toBe(1);

		const cleared = clearOwnedFilters(current, EVERYTHING_VISIBLE);
		expect(cleared.assignees).toEqual(['me']);
		expect(ownedFilterCount(cleared, EVERYTHING_VISIBLE)).toBe(0);
	});

	test('counts and clears unassigned with the assignee dimension', () => {
		const current = filter({ assignees: ['me'], unassigned: true });
		expect(ownedFilterCount(current, EVERYTHING_VISIBLE)).toBe(1);

		const cleared = clearOwnedFilters(current, EVERYTHING_VISIBLE);
		expect(cleared.assignees).toEqual(['me']);
		expect(cleared.unassigned).toBe(false);
		expect(ownedFilterCount(cleared, EVERYTHING_VISIBLE)).toBe(0);
	});

	test('counts and clears the blocked dimension', () => {
		const current = filter({ blocked: false, sizes: ['sm'] });
		expect(ownedFilterCount(current, EVERYTHING_VISIBLE)).toBe(2);

		const cleared = clearOwnedFilters(current, EVERYTHING_VISIBLE);
		expect(cleared.blocked).toBeNull();
		expect(cleared.sizes).toEqual([]);
		expect(ownedFilterCount(cleared, EVERYTHING_VISIBLE)).toBe(0);
	});

	test('state counts only when the drawer offers the state switch', () => {
		const current = filter({ states: ['closed'] });
		expect(ownedFilterCount(current, EVERYTHING_VISIBLE)).toBe(1);
		expect(ownedFilterCount(current, { hidden: new Set(), showState: false })).toBe(0);

		const cleared = clearOwnedFilters(current, { hidden: new Set(), showState: false });
		expect(cleared.states).toEqual(['closed']);
	});
});
