/**
 * Global navigation catalog for the Composition A shell.
 *
 * Composition A has exactly one navigation layer: a compact dark navbar with
 * at most six visible text destinations and a `More` overflow menu. Keeping the
 * destinations here (rather than inline in the markup) means the navbar, the
 * responsive collapse, and the navigation tests all read the same list, so a
 * destination cannot silently disappear when the shell changes.
 */

export interface NavDestination {
	href: string;
	label: string;
	icon: string;
	/** Path prefix that marks the destination active. */
	match: string;
	/**
	 * Exact-context marker. `my-issues` is active for `/issues?assignee=me`,
	 * while plain `issues` is active for every other `/issues` URL.
	 */
	context?: 'mine';
}

/** The six text destinations A demonstrates in the primary navbar. */
export const PRIMARY_NAV: readonly NavDestination[] = [
	{ href: '/inbox', label: 'Inbox', icon: 'bi-inbox', match: '/inbox' },
	{ href: '/issues', label: 'Issues', icon: 'bi-list-task', match: '/issues' },
	{ href: '/board', label: 'Board', icon: 'bi-kanban', match: '/board' },
	{ href: '/matrix', label: 'Matrix', icon: 'bi-grid-3x3', match: '/matrix' },
	{ href: '/plan', label: 'Plan', icon: 'bi-calendar-range', match: '/plan' },
	{ href: '/timeline', label: 'Timeline', icon: 'bi-bar-chart-steps', match: '/timeline' }
];

/**
 * Destinations that do not fit the six-link primary set. They stay reachable
 * in the navbar's `More` menu so removing the sidebar never drops a route.
 */
export const OVERFLOW_NAV: readonly NavDestination[] = [
	{
		href: '/issues?assignee=me',
		label: 'My Issues',
		icon: 'bi-person-check',
		match: '/issues',
		context: 'mine'
	},
	{ href: '/attention', label: 'Attention', icon: 'bi-exclamation-triangle', match: '/attention' },
	{ href: '/epics', label: 'Epics', icon: 'bi-layers', match: '/epics' },
	{ href: '/milestones', label: 'Milestones', icon: 'bi-flag', match: '/milestones' }
];

/** Every destination the authenticated shell must keep reachable. */
export const ALL_NAV: readonly NavDestination[] = [...PRIMARY_NAV, ...OVERFLOW_NAV];

/** The read-only slice of the page URL that active-state detection needs. */
export interface NavUrl {
	pathname: string;
	searchParams: { getAll(name: string): string[] };
}

function isMine(url: NavUrl): boolean {
	const assignees = url.searchParams.getAll('assignee');
	return assignees.length === 1 && assignees[0] === 'me';
}

/** Whether a destination is the current page for `url`. */
export function isNavActive(destination: NavDestination, url: NavUrl): boolean {
	const path = url.pathname;
	if (!path.startsWith(destination.match)) return false;

	if (destination.context === 'mine') {
		return destination.match === '/issues' && isMine(url);
	}
	if (destination.match === '/issues') {
		// The detail route also selects Issues. `My Issues` owns `?assignee=me`.
		return path === '/issues' || path.startsWith('/issues/') ? !isMine(url) : false;
	}
	return true;
}

/**
 * The overflow destination matching `url`, or `null` when the current page is
 * a primary destination (or outside the catalog).
 *
 * The navbar uses this to give the closed `More` toggle the same current-page
 * treatment as a visible link. Without it, five destinations look unselected
 * in the shell because their active item lives inside a collapsed menu.
 */
export function overflowDestination(url: NavUrl): NavDestination | null {
	return OVERFLOW_NAV.find((destination) => isNavActive(destination, url)) ?? null;
}

