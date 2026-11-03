<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Breadcrumb, BreadcrumbItem, Button, Input } from '@sveltestrap/sveltestrap';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import IssueTable from '#lib/components/issue/IssueTable.svelte';
	import type { GroupKey } from '#lib/components/issue/grouping';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { createFeed } from '#lib/client/feed.svelte';
	import { getGroupBy, setGroupBy } from '#lib/client/list-prefs.svelte';
	import { projectIssues, reconcileIssues } from '#lib/client/optimistic.svelte';
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

	// Status and priority are single-choice in the toolbar. A URL carrying a
	// multi-select (or a status/priority the toolbar does not offer) reads as
	// "All" until the reader picks a value.
	const STATUS_VALUES: readonly string[] = ['backlog', 'todo', 'in-progress', 'in-review'];
	const PRIORITY_VALUES: readonly string[] = ['p1', 'p2', 'p3'];

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
		const value = filter.assignees.length === 1 ? filter.assignees[0] : '';
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

	// State is a scope switch owned by the Filters offcanvas, not a filter
	// dimension, so it does not contribute to the header's filter count.
	const filterCount = $derived(activeFilterCount({ ...filter, states: [] }));
	const repoScope = $derived(filter.repos.length === 1 ? filter.repos[0] : null);

	const HIDDEN_FILTERS = ['status', 'priority', 'assignee'] as const;

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

	function setStatus(value: string) {
		apply({ statuses: value ? [value] : [] });
	}

	function setPriority(value: string) {
		apply({ priorities: value ? [value] : [] });
	}

	function setAssignee(value: string) {
		apply({ assignees: value ? [value] : [] });
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

<PageHead
	title="Issues"
	description="Every open issue in the current scope, grouped for scanning."
/>

<main class="container-xl py-4">
	<Breadcrumb class="mb-2">
		<BreadcrumbItem><a href="/issues">Workspace</a></BreadcrumbItem>
		<BreadcrumbItem active>Issues</BreadcrumbItem>
	</Breadcrumb>

	<PageHeader
		title="Issues"
		count={issueFeed.total}
		description="Every open issue in the current scope, grouped for scanning."
	>
		{#snippet actions()}
			{#if filterCount > 0}
				<Button
					color="link"
					size="sm"
					class="text-decoration-none p-0"
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
			/>
		{/snippet}
	</PageHeader>

	<div class="row g-2 align-items-center mb-3">
		<div class="col-12 col-lg-4">
			<FeedSearch size="sm" />
		</div>

		<div class="col-6 col-lg-2">
			<Input
				id="issue-status-filter"
				type="select"
				bsSize="sm"
				value={currentStatus}
				on:change={(event) => setStatus(event.currentTarget.value)}
				aria-label="Filter by status"
			>
				<option value="">All statuses</option>
				{#each STATUS_FILTER_OPTIONS as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</Input>
		</div>

		<div class="col-6 col-lg-2">
			<Input
				id="issue-priority-filter"
				type="select"
				bsSize="sm"
				value={currentPriority}
				on:change={(event) => setPriority(event.currentTarget.value)}
				aria-label="Filter by priority"
			>
				<option value="">All priorities</option>
				{#each PRIORITY_FILTER_OPTIONS as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</Input>
		</div>

		<div class="col-6 col-lg-2">
			<Input
				id="issue-assignee-filter"
				type="select"
				bsSize="sm"
				value={currentAssignee}
				on:change={(event) => setAssignee(event.currentTarget.value)}
				aria-label="Filter by assignee"
			>
				{#each assigneeOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</Input>
		</div>

		<div class="col-6 col-lg-2">
			<Input
				id="issue-group-filter"
				type="select"
				bsSize="sm"
				value={currentGroup}
				on:change={(event) => setGroupBy(event.currentTarget.value as GroupKey)}
				aria-label="Group issues by"
			>
				{#each groupOptions as option (option.value)}
					<option value={option.value}>Group: {option.label}</option>
				{/each}
			</Input>
		</div>
	</div>

	<IssueTable
		feed={issueFeed}
		repoShortcodes={data.repoShortcodes}
		projects={data.projects}
		onclear={clearFilters}
		project={projectIssues}
		{repoScope}
	/>
</main>
