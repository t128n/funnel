import { activeFilterCount, type ClientFilter } from '#lib/url-filter';

/** A filter dimension a caller can own in the toolbar or the More filters drawer. */
export type FilterDimension =
	| 'repo'
	| 'status'
	| 'assignee'
	| 'priority'
	| 'size'
	| 'type'
	| 'label'
	| 'planned'
	| 'milestone'
	| 'blocked'
	| 'waiting'
	| 'state';

/** Dimensions the drawer does not own, plus whether it offers the state switch. */
export interface DrawerScope {
	hidden: ReadonlySet<FilterDimension>;
	showState: boolean;
}

/** `me` belongs to the All/Mine scope switch, not the drawer's assignee list. */
export const ME = 'me';

/** True when the drawer renders and owns this dimension. */
export function ownsDimension(dimension: FilterDimension, scope: DrawerScope): boolean {
	if (scope.hidden.has(dimension)) return false;
	if (dimension === 'state' && !scope.showState) return false;
	return true;
}

/**
 * Count exactly the filters the drawer's Clear action removes. Search and the
 * `me` scope stay in the toolbar, and hidden dimensions belong to another
 * surface, so none of them contribute to the badge.
 */
export function ownedFilterCount(filter: ClientFilter, scope: DrawerScope): number {
	return activeFilterCount({
		...filter,
		repos: ownsDimension('repo', scope) ? filter.repos : [],
		states: ownsDimension('state', scope) ? filter.states : [],
		statuses: ownsDimension('status', scope) ? filter.statuses : [],
		assignees: ownsDimension('assignee', scope)
			? filter.assignees.filter((value) => value !== ME)
			: [],
		unassigned: ownsDimension('assignee', scope) ? filter.unassigned : false,
		priorities: ownsDimension('priority', scope) ? filter.priorities : [],
		sizes: ownsDimension('size', scope) ? filter.sizes : [],
		types: ownsDimension('type', scope) ? filter.types : [],
		labels: ownsDimension('label', scope) ? filter.labels : [],
		planned: ownsDimension('planned', scope) ? filter.planned : [],
		milestones: ownsDimension('milestone', scope) ? filter.milestones : [],
		blocked: ownsDimension('blocked', scope) ? filter.blocked : null,
		waiting: ownsDimension('waiting', scope) ? filter.waiting : null,
		search: ''
	});
}

/**
 * Return the filter after clearing every dimension the drawer owns. Search,
 * hidden toolbar dimensions and the `me` scope are preserved, so this removes
 * exactly {@link ownedFilterCount} dimensions.
 */
export function clearOwnedFilters(filter: ClientFilter, scope: DrawerScope): ClientFilter {
	return {
		...filter,
		repos: ownsDimension('repo', scope) ? [] : filter.repos,
		states: ownsDimension('state', scope) ? [] : filter.states,
		statuses: ownsDimension('status', scope) ? [] : filter.statuses,
		assignees: ownsDimension('assignee', scope)
			? filter.assignees.filter((value) => value === ME)
			: filter.assignees,
		unassigned: ownsDimension('assignee', scope) ? false : filter.unassigned,
		priorities: ownsDimension('priority', scope) ? [] : filter.priorities,
		sizes: ownsDimension('size', scope) ? [] : filter.sizes,
		types: ownsDimension('type', scope) ? [] : filter.types,
		labels: ownsDimension('label', scope) ? [] : filter.labels,
		planned: ownsDimension('planned', scope) ? [] : filter.planned,
		milestones: ownsDimension('milestone', scope) ? [] : filter.milestones,
		blocked: ownsDimension('blocked', scope) ? null : filter.blocked,
		waiting: ownsDimension('waiting', scope) ? null : filter.waiting
	};
}
