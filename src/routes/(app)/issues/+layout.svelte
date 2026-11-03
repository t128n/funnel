<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Button,
		Dropdown,
		DropdownItem,
		DropdownMenu,
		DropdownToggle
	} from '@sveltestrap/sveltestrap';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import GroupByControl from '#lib/components/issue/GroupByControl.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import { createFeed } from '#lib/client/feed.svelte';
	import { projectIssues, reconcileIssues } from '#lib/client/optimistic.svelte';
	import { FEED_ENDPOINTS } from '#lib/feeds';
	import { parseIssueParams, type IssueParams } from '#lib/issue-url';
	import {
		activeFilterCount,
		buildFilterUrl,
		EMPTY_CLIENT_FILTER,
		parseFilterParams
	} from '#lib/url-filter';
	import type { IssueListItem } from '#lib/server/issues/types';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

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

	// The open issue is a route param, so the feed highlights it without any
	// query-parameter state.
	const selected = $derived(parseIssueParams(page.params as IssueParams));

	const filter = $derived(parseFilterParams(page.url.searchParams));
	const mine = $derived(
		filter.assignees.length === 1 && filter.assignees[0] === 'me'
	);

	/**
	 * State is a scope switch, not one of the popover's filter dimensions:
	 * `open` is the server default and serializes as no `state` param at all.
	 */
	type StateView = 'open' | 'closed' | 'all';
	const STATE_OPTIONS: { value: StateView; label: string }[] = [
		{ value: 'open', label: 'Open' },
		{ value: 'closed', label: 'Closed' },
		{ value: 'all', label: 'All' }
	];

	const stateView = $derived.by((): StateView => {
		const states = new Set(filter.states);
		if (states.has('open') && states.has('closed')) return 'all';
		if (states.has('closed')) return 'closed';
		return 'open';
	});
	const stateLabel = $derived(
		STATE_OPTIONS.find((option) => option.value === stateView)?.label ?? 'Open'
	);

	// `assignee=me` is the All/Mine scope and `state` is the header scope, so
	// neither counts as a filter in the summary or the popover badge.
	const filterCount = $derived(
		activeFilterCount({
			...filter,
			states: [],
			assignees: filter.assignees.filter((value) => value !== 'me')
		})
	);

	const scopeLine = $derived(
		[
			mine ? 'Assigned to you' : null,
			filterCount > 0
				? `${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}`
				: null
		]
			.filter((value): value is string => value !== null)
			.join(' · ')
	);

	// A closed-only scope is a constrained subset; "All" with no issues is still
	// an empty dataset. The no-results action resets the scope to the default.
	const filtered = $derived(filterCount > 0 || stateView === 'closed');

	function setState(next: StateView) {
		void goto(
			buildFilterUrl(page.url.pathname, page.url.searchParams, {
				...filter,
				states:
					next === 'all' ? ['open', 'closed'] : next === 'closed' ? ['closed'] : []
			}),
			{ reset: false }
		);
	}

	function clearFilters() {
		void goto(
			buildFilterUrl(page.url.pathname, page.url.searchParams, {
				...EMPTY_CLIENT_FILTER,
				assignees: filter.assignees.filter((value) => value === 'me')
			}),
			{ reset: false }
		);
	}

	// Merge each fresh first page into the loaded window; SSE refreshes keep the
	// rows already scrolled past, and a filter change resets the window.
	$effect(() => {
		issueFeed.sync(data.issues);
	});

	// Drop overlays once the authoritative stream reflects them.
	$effect(() => reconcileIssues(data.issues.items));
</script>

<PageHead
	title={mine ? 'My Issues' : 'Issues'}
	description="Every mirrored GitHub issue, filtered and grouped."
/>

<SplitView detailOpen={selected !== null}>
	{#snippet feed()}
		<div class="d-flex min-h-0 flex-grow-1 flex-column overflow-y-auto bg-body">
			<PageHeader
				title={mine ? 'My Issues' : 'Issues'}
				count={issueFeed.total}
				description={scopeLine || undefined}
				level={selected ? 2 : 1}
			/>

			<Toolbar>
				<FeedSearch />
				<FilterPopover options={data.options} allowNoStatus={false} />
				<ViewSegment />
				<Dropdown>
					<DropdownToggle
						color="secondary"
						outline
						aria-label={`State: ${stateLabel}. Change state`}
					>
						<span>{stateLabel}</span>
						<i class="bi bi-chevron-down small ms-2" aria-hidden="true"></i>
					</DropdownToggle>
					<DropdownMenu>
						<li><h6 class="dropdown-header">State</h6></li>
						{#each STATE_OPTIONS as option (option.value)}
							<DropdownItem
								active={stateView === option.value}
								on:click={() => setState(option.value)}
							>
								<i
									class="bi bi-check-lg me-2 {stateView === option.value
										? ''
										: 'invisible'}"
									aria-hidden="true"
								></i>
								{option.label}
							</DropdownItem>
						{/each}
					</DropdownMenu>
				</Dropdown>
				<div class="d-none d-sm-block">
					<GroupByControl
						projects={data.projects}
						hasMilestones={data.options.milestones.length > 0}
					/>
				</div>
				{#if filterCount > 0 && issueFeed.total > 0}
					<Button color="link" class="text-decoration-none" on:click={clearFilters}>
						Clear filters
					</Button>
				{/if}
			</Toolbar>

			<div class="d-flex flex-grow-1 flex-column" style="min-height: 30svh">
				<IssueList
					feed={issueFeed}
					{selected}
					empty={filtered ? 'No issues match these filters.' : 'No issues yet.'}
					{filtered}
					onclear={clearFilters}
					repoShortcodes={data.repoShortcodes}
					projects={data.projects}
					project={projectIssues}
					resetKey={page.url.search}
				>
					{#snippet emptyAction()}
						<Button href="/intake" color="primary" size="sm">Submit an Issue</Button>
					{/snippet}
				</IssueList>
			</div>
		</div>
	{/snippet}

	{#snippet detail()}
		{@render children()}
	{/snippet}
</SplitView>
