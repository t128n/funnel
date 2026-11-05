<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Breadcrumb, BreadcrumbItem, Button } from '@sveltestrap/sveltestrap';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import IssueTable from '#lib/components/issue/IssueTable.svelte';
	import { issuesIdentity } from '#lib/components/issue/page-identity';
	import SortControl from '#lib/components/issue/SortControl.svelte';
	import type { GroupKey } from '#lib/components/issue/grouping';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { createFeed } from '#lib/client/feed.svelte';
	import { getGroupBy, setGroupBy } from '#lib/client/list-prefs.svelte';
	import { projectIssues, reconcileIssues } from '#lib/client/optimistic.svelte';
	import { canWrite } from '#lib/roles';
	import { FEED_ENDPOINTS } from '#lib/feeds';
	import {
		activeFilterCount,
		buildFilterUrl,
		EMPTY_CLIENT_FILTER,
		parseFilterParams,
		type ClientFilter
	} from '#lib/url-filter';
	import type { IssueListItem } from '#lib/server/issues/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * The loaded window over the filtered issue stream. The server renders the
	 * first page; `loadMore` walks the keyset cursor as the reader scrolls. The
	 * URL search string is the view identity, so a filter change replaces the
	 * window instead of merging into it.
	 */
	const issueFeed = createFeed<IssueListItem>({
		endpoint: FEED_ENDPOINTS.issues,
		initial: untrack(() => data.issues),
		key: () => page.url.search,
		itemKey: (issue) => `${issue.repoId}:${issue.number}`,
		query: () => page.url.search
	});

	const filter = $derived(parseFilterParams(page.url.searchParams));

	// State, status and priority are single-choice in the toolbar. A URL carrying
	// a multi-select (or a value the toolbar does not offer) reads as "All" until
	// the reader picks a value.
	const STATUS_VALUES: readonly string[] = ['backlog', 'todo', 'in-progress', 'in-review'];
	const PRIORITY_VALUES: readonly string[] = ['p1', 'p2', 'p3'];

	const currentState = $derived.by((): 'open' | 'closed' | 'all' => {
		const states = new Set(filter.states);
		if (states.has('open') && states.has('closed')) return 'all';
		if (states.has('closed')) return 'closed';
		return 'open';
	});

	const STATUS_FILTER_OPTIONS = [
		{ value: 'backlog', label: 'Backlog' },
		{ value: 'todo', label: 'Todo' },
		{ value: 'in-progress', label: 'In progress' },
		{ value: 'in-review', label: 'In review' }
	];
	const PRIORITY_FILTER_OPTIONS = [
		{ value: 'p1', label: 'P1 High' },
		{ value: 'p2', label: 'P2 Medium' },
		{ value: 'p3', label: 'P3 Low' }
	];

	const currentStatus = $derived(
		filter.statuses.length === 1 && STATUS_VALUES.includes(filter.statuses[0])
			? filter.statuses[0]
			: ''
	);
	const currentPriority = $derived(
		filter.priorities.length === 1 && PRIORITY_VALUES.includes(filter.priorities[0])
			? filter.priorities[0]
			: ''
	);

	const assigneeOptions = $derived.by(() => {
		const options = [
			{ value: '', label: 'Anyone' },
			{ value: 'me', label: 'Assigned to me' }
		];
		for (const person of data.options.assignees) {
			if (!options.some((option) => option.value === person.login)) {
				options.push({ value: person.login, label: person.login });
			}
		}
		if (!options.some((option) => option.value === 'none')) {
			options.push({ value: 'none', label: 'Unassigned' });
		}
		return options;
	});
	const currentAssignee = $derived.by(() => {
		const value =
			filter.unassigned && filter.assignees.length === 0
				? 'none'
				: filter.assignees.length === 1
					? filter.assignees[0]
					: '';
		return assigneeOptions.some((option) => option.value === value) ? value : '';
	});

	const storedGroup = $derived(getGroupBy());
	const groupOptions = $derived.by((): { value: GroupKey; label: string }[] => [
		{ value: 'status', label: 'Status' },
		{ value: 'priority', label: 'Priority' },
		...(data.projects.length > 0
			? [{ value: 'project' as GroupKey, label: 'Project' }]
			: []),
		...(data.options.milestones.length > 0
			? [{ value: 'milestone' as GroupKey, label: 'Milestone' }]
			: []),
		{ value: 'repo', label: 'Repository' },
		{ value: 'none', label: 'None' }
	]);
	const currentGroup = $derived(
		groupOptions.some((option) => option.value === storedGroup) ? storedGroup : 'none'
	);

	// The header count and "Clear" cover every active dimension, including the
	// search term, State and the My Issues scope. The "More filters" drawer
	// counts and clears only the long-tail dimensions it owns.
	const filterCount = $derived(activeFilterCount(filter));
	const repoScope = $derived(filter.repos.length === 1 ? filter.repos[0] : null);

	// Bulk writes are limited to `write` users; read-only viewers keep the same
	// table without checkboxes or the action bar.
	const mayWrite = $derived(canWrite(data.user?.role));
	const bulkAssignees = $derived(data.options.assignees.map((person) => person.login));
	const bulkLabels = $derived(data.options.labels);

	// `/issues?assignee=me` is the My Issues destination. It keeps the same
	// table and filters but gets its own heading, description and document title.
	const identity = $derived(issuesIdentity(filter));
	const pageTitle = $derived(identity.title);
	const pageDescription = $derived(identity.description);

	const HIDDEN_FILTERS = ['state', 'status', 'priority', 'assignee'] as const;

	function apply(patch: Partial<ClientFilter>) {
		void goto(
			buildFilterUrl(page.url.pathname, page.url.searchParams, { ...filter, ...patch }),
			{ reset: false }
		);
	}

	function clearFilters() {
		void goto(
			buildFilterUrl(page.url.pathname, page.url.searchParams, EMPTY_CLIENT_FILTER),
			{ reset: false }
		);
	}

	function setState(value: string) {
		apply({
			states: value === 'all' ? ['open', 'closed'] : value === 'closed' ? ['closed'] : []
		});
	}

	function setStatus(value: string) {
		apply({ statuses: value ? [value] : [] });
	}

	function setPriority(value: string) {
		apply({ priorities: value ? [value] : [] });
	}

	function setAssignee(value: string) {
		apply({
			assignees: value && value !== 'none' ? [value] : [],
			unassigned: value === 'none'
		});
	}

	// Merge each fresh first page into the loaded window; SSE refreshes keep
	// the rows already scrolled past, and a filter change resets the window.
	$effect(() => {
		issueFeed.sync(data.issues);
	});

	// A filter change swaps the loaded window; return the reader to the top of
	// the index, matching the old feed scroller's reset behaviour.
	let lastSearch = untrack(() => page.url.search);
	$effect(() => {
		const search = page.url.search;
		if (search === lastSearch) return;
		lastSearch = search;
		window.scrollTo({ top: 0 });
	});

	// Drop overlays once the authoritative stream reflects them.
	$effect(() => reconcileIssues(data.issues.items));
</script>

<PageHead title={pageTitle} description={pageDescription} />

<main class="container-xl py-4">
	<Breadcrumb aria-label="breadcrumb" class="mb-2">
		<BreadcrumbItem><a href="/issues">Workspace</a></BreadcrumbItem>
		<BreadcrumbItem active>{pageTitle}</BreadcrumbItem>
	</Breadcrumb>

	<PageHeader title={pageTitle} count={issueFeed.total} description={pageDescription}>
		{#snippet actions()}
			<!-- Grouping is a view preference, not a filter; keeping it in the
			     header leaves the single filter toolbar room for search. -->
			<select
				id="issue-group-filter"
				class="form-select form-select-sm w-auto"
				value={currentGroup}
				onchange={(event) => setGroupBy(event.currentTarget.value as GroupKey)}
				aria-label="Group issues by"
			>
				{#each groupOptions as option (option.value)}
					<option value={option.value}>Group: {option.label}</option>
				{/each}
			</select>
		{/snippet}
	</PageHeader>

	<div class="issues-toolbar d-flex flex-wrap align-items-center gap-2 mb-3">
		<div class="issues-search min-w-0">
			<FeedSearch size="sm" />
		</div>

		<select
			id="issue-state-filter"
			class="form-select form-select-sm w-auto"
			value={currentState}
			onchange={(event) => setState(event.currentTarget.value)}
			aria-label="Filter by state"
		>
			<option value="open">Open</option>
			<option value="closed">Closed</option>
			<option value="all">All</option>
		</select>

		<select
			id="issue-status-filter"
			class="form-select form-select-sm w-auto"
			value={currentStatus}
			onchange={(event) => setStatus(event.currentTarget.value)}
			aria-label="Filter by status"
		>
			<option value="">All statuses</option>
			{#each STATUS_FILTER_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>

		<select
			id="issue-priority-filter"
			class="form-select form-select-sm w-auto"
			value={currentPriority}
			onchange={(event) => setPriority(event.currentTarget.value)}
			aria-label="Filter by priority"
		>
			<option value="">All priorities</option>
			{#each PRIORITY_FILTER_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>

		<select
			id="issue-assignee-filter"
			class="form-select form-select-sm w-auto"
			value={currentAssignee}
			onchange={(event) => setAssignee(event.currentTarget.value)}
			aria-label="Filter by assignee"
		>
			{#each assigneeOptions as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>

		<SortControl />

		{#if filterCount > 0}
			<Button
				color="link"
				size="sm"
				class="text-decoration-none p-0 ms-auto"
				onclick={clearFilters}
			>
				Clear {filterCount} active {filterCount === 1 ? 'filter' : 'filters'}
			</Button>
		{/if}

		<FilterPopover
			options={data.options}
			allowNoStatus={false}
			showState
			hide={HIDDEN_FILTERS}
			quiet
		/>
	</div>

	<IssueTable
		feed={issueFeed}
		repoShortcodes={data.repoShortcodes}
		projects={data.projects}
		onclear={clearFilters}
		project={projectIssues}
		{repoScope}
		{mayWrite}
		assignees={bulkAssignees}
		labels={bulkLabels}
	/>
</main>

<style>
	.issues-toolbar {
		container: issues-toolbar / inline-size;
	}

	/*
	 * The search competes with six controls inside the page container, not the
	 * viewport. It keeps a readable basis at every width and owns a full row
	 * once that container is too narrow to share.
	 */
	.issues-search {
		flex: 1 1 22rem;
		max-width: 100%;
	}

	@container issues-toolbar (max-width: 520px) {
		.issues-search {
			flex-basis: 100%;
		}
	}
</style>
