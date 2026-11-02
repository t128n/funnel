<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import GroupByControl from '#lib/components/issue/GroupByControl.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import { Button } from '#lib/components/ui/button';
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
	// `assignee=me` is the All/Mine scope, not one of the popover's filters.
	const filterCount = $derived(
		activeFilterCount({
			...filter,
			assignees: filter.assignees.filter((value) => value !== 'me')
		})
	);

	const stateLabel = $derived.by(() => {
		const states = new Set(filter.states);
		if (states.has('open') && states.has('closed')) return 'Open and closed';
		if (states.has('closed')) return 'Closed';
		return 'Open';
	});

	const scopeLine = $derived(
		[
			stateLabel,
			mine ? 'Assigned to you' : null,
			filterCount > 0
				? `${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}`
				: null
		]
			.filter((value): value is string => value !== null)
			.join(' · ')
	);

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
		<div class="flex min-h-0 flex-1 flex-col bg-canvas">
			<PageHeader
				title={mine ? 'My Issues' : 'Issues'}
				count={issueFeed.total.toLocaleString()}
				description={scopeLine}
				level={selected ? 2 : 1}
			>
				{#snippet actions()}
					{#if filterCount > 0}
						<Button variant="ghost" size="sm" onclick={clearFilters}>Clear filters</Button>
					{/if}
				{/snippet}
			</PageHeader>

			<Toolbar>
				<FeedSearch />
				<ViewSegment />
				<GroupByControl
					projects={data.projects}
					hasMilestones={data.options.milestones.length > 0}
				/>
				<FilterPopover options={data.options} allowNoStatus={false} showState />
			</Toolbar>

			<IssueList
				feed={issueFeed}
				{selected}
				empty={filterCount === 0 && filter.states.length === 0
					? 'No issues yet.'
					: 'No issues match these filters.'}
				repoShortcodes={data.repoShortcodes}
				projects={data.projects}
				project={projectIssues}
				resetKey={page.url.search}
			/>
		</div>
	{/snippet}

	{#snippet detail()}
		{@render children()}
	{/snippet}
</SplitView>
