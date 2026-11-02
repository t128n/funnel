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
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Button, buttonVariants } from '#lib/components/ui/button';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
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
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas">
			<PageHeader
				title={mine ? 'My Issues' : 'Issues'}
				description={scopeLine || undefined}
				level={selected ? 2 : 1}
			>
				{#snippet actions()}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class={buttonVariants({ variant: 'outline', size: 'sm' })}
							aria-label={`State: ${stateLabel}. Change state`}
						>
							<span>{stateLabel}</span>
							<ChevronDownIcon
								class="size-3.5 shrink-0 text-fg-muted"
								aria-hidden="true"
							/>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-40">
							<DropdownMenu.Label>State</DropdownMenu.Label>
							<DropdownMenu.RadioGroup
								value={stateView}
								onValueChange={(value) => setState(value as StateView)}
							>
								{#each STATE_OPTIONS as option (option.value)}
									<DropdownMenu.RadioItem value={option.value} closeOnSelect>
										{option.label}
									</DropdownMenu.RadioItem>
								{/each}
							</DropdownMenu.RadioGroup>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					{#if filterCount > 0 && issueFeed.total > 0}
						<Button variant="ghost" size="sm" onclick={clearFilters}>
							Clear Filters
						</Button>
					{/if}
				{/snippet}
			</PageHeader>

			<Toolbar>
				<FeedSearch />
				<ViewSegment />
				<div class="max-sm:hidden">
					<GroupByControl
						projects={data.projects}
						hasMilestones={data.options.milestones.length > 0}
					/>
				</div>
				<FilterPopover options={data.options} allowNoStatus={false} />
			</Toolbar>

			<div class="flex min-h-[30svh] flex-1 flex-col">
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
						<Button href="/intake" size="sm">Submit an Issue</Button>
					{/snippet}
				</IssueList>
			</div>
		</div>
	{/snippet}

	{#snippet detail()}
		{@render children()}
	{/snippet}
</SplitView>
