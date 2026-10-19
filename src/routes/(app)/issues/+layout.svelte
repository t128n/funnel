<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import GroupByControl from '#lib/components/issue/GroupByControl.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import { createFeed } from '#lib/client/feed.svelte';
	import { projectIssues, reconcileIssues } from '#lib/client/optimistic.svelte';
	import { FEED_ENDPOINTS } from '#lib/feeds';
	import { parseIssueParams, type IssueParams } from '#lib/issue-url';
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

	// Merge each fresh first page into the loaded window; SSE refreshes keep the
	// rows already scrolled past, and a filter change resets the window.
	$effect(() => {
		issueFeed.sync(data.issues);
	});

	// Drop overlays once the authoritative stream reflects them.
	$effect(() => reconcileIssues(data.issues.items));
</script>

<PageHead
	title="Issues"
	description="Every mirrored GitHub issue, filtered and grouped."
/>

<SplitView detailOpen={selected !== null}>
	{#snippet feed()}
		<div class="surface-shell bg-[var(--surface-canvas)] flex min-h-0 flex-1 flex-col">
			<header
				class="border-[color:var(--surface-divider)] flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 sm:py-0"
			>
				<h1 class="text-base font-semibold tracking-tight">Issues</h1>
				<span class="mono text-muted-foreground text-xs">{issueFeed.total}</span>
				<div
					class="order-last w-full min-w-0 sm:order-none sm:mx-auto sm:w-auto sm:max-w-md sm:flex-1 sm:px-2"
				>
					<FeedSearch />
				</div>
				<div class="ml-auto flex shrink-0 items-center gap-1">
					<ViewSegment />
					<GroupByControl projects={data.projects} hasMilestones={data.options.milestones.length > 0} />
					<FilterPopover options={data.options} allowNoStatus={false} showState />
				</div>
			</header>

			<IssueList
				feed={issueFeed}
				{selected}
				empty="No issues match these filters."
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
