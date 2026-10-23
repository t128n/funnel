<script lang="ts">
	import { untrack } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import { page } from '$app/state';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import GroupByControl from '#lib/components/issue/GroupByControl.svelte';
	import IssueGroupHeader from '#lib/components/issue/IssueGroupHeader.svelte';
	import IssueListHeader from '#lib/components/issue/IssueListHeader.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import SubmissionRow from '#lib/components/inbox/SubmissionRow.svelte';
	import IssueRow from '#lib/components/issue/IssueRow.svelte';
	import * as Alert from '#lib/components/ui/alert';
	import * as Empty from '#lib/components/ui/empty';
	import { createFeed } from '#lib/client/feed.svelte';
	import {
		isGroupCollapsed,
		toggleGroup,
		getGroupBy
	} from '#lib/client/list-prefs.svelte';
	import {
		projectInboxEntries,
		reconcileIssues,
		reconcileSubmissions
	} from '#lib/client/optimistic.svelte';
	import { FEED_ENDPOINTS, flattenInboxRows } from '#lib/feeds';
	import { parseIssueParams, type IssueParams } from '#lib/issue-url';
	import type { IssueListItem, RenderedInboxEntry } from '#lib/server/issues/types';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	/** How close to the end (px) the scroller must be to fetch the next page. */
	const END_THRESHOLD = 300;

	// The queue is one keyset feed: submissions always ride along on the first
	// page, issues walk forward with the cursor. `projectInboxEntries` layers
	// optimistic hides/triage on top of the loaded window.
	const inboxFeed = createFeed<RenderedInboxEntry>({
		endpoint: FEED_ENDPOINTS.inbox,
		initial: untrack(() => data.inbox),
		key: () => page.url.search,
		itemKey: (entry) =>
			entry.kind === 'submission'
				? `submission:${entry.submission.id}`
				: `issue:${entry.issue.repoId}:${entry.issue.number}`,
		query: () => new URLSearchParams(page.url.search)
	});

	// A fresh server page (initial load, filter change, SSE refresh) is merged
	// into the loaded window; a new filter key replaces it.
	$effect(() => {
		inboxFeed.sync(data.inbox);
	});

	const entries = $derived(projectInboxEntries(inboxFeed.items));
	const requested = $derived(getGroupBy());
	// A stored `project` preference with no configured projects renders flat.
	const groupBy = $derived(
		requested === 'project' && data.projects.length === 0 ? 'none' : requested
	);
	const rows = $derived(
		flattenInboxRows(
			entries,
			groupBy,
			data.repoShortcodes,
			data.projects,
			(key) => isGroupCollapsed(key)
		)
	);
	// The server total covers the whole queue; the optimistic projection may
	// hide loaded rows, so subtract exactly those from the head count.
	const hidden = $derived(Math.max(0, inboxFeed.items.length - entries.length));
	const total = $derived(Math.max(0, inboxFeed.total - hidden));

	// The open issue and staged submission are route params.
	const selectedIssue = $derived(parseIssueParams(page.params as IssueParams));
	const selectedSubmissionId = $derived(
		(page.params as { id?: string }).id ?? null
	);

	// Drop overlays and submission hides once the authoritative queue reflects
	// them; a stale refresh leaves them in place.
	$effect(() => {
		const issues: IssueListItem[] = [];
		const submissionIds: string[] = [];
		for (const entry of data.inbox.items) {
			if (entry.kind === 'issue') issues.push(entry.issue);
			else submissionIds.push(entry.submission.id);
		}
		reconcileIssues(issues);
		reconcileSubmissions(submissionIds);
	});

	let scroller: HTMLDivElement | undefined = $state();
	let handle: VirtualizerHandle | undefined = $state();

	// A filter change swaps the loaded window; return the reader to the top.
	let lastReset = untrack(() => page.url.search);
	$effect(() => {
		const key = page.url.search;
		if (key === lastReset) return;
		lastReset = key;
		if (scroller) scroller.scrollTop = 0;
		handle?.scrollTo(0);
	});

	/** Fetch the next page once the window is within {@link END_THRESHOLD}. */
	function maybeLoadMore(): void {
		if (inboxFeed.loading || inboxFeed.error !== null || inboxFeed.nextCursor === null) return;
		if (!handle) return;
		const remaining =
			handle.getScrollSize() - handle.getViewportSize() - handle.getScrollOffset();
		if (remaining <= END_THRESHOLD) void inboxFeed.loadMore();
	}

	const formError = $derived(
		page.form && 'message' in (page.form.data ?? {})
			? (page.form.data as { message?: string }).message
			: null
	);

	function isSelectedIssue(repo: string, number: number): boolean {
		return (
			selectedIssue !== null &&
			selectedIssue.number === number &&
			selectedIssue.repo === repo
		);
	}
</script>

<PageHead
	title="Inbox"
	description="Pending intake submissions and untriaged issues."
/>

<SplitView detailOpen={selectedIssue !== null || selectedSubmissionId !== null}>
	{#snippet feed()}
		<div class="surface-shell bg-[var(--surface-canvas)] flex min-h-0 flex-1 flex-col">
			<header
				class="border-[color:var(--surface-divider)] flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 sm:py-0"
			>
				<h1 class="text-base font-semibold tracking-tight">Inbox</h1>
				<span class="mono text-muted-foreground text-xs">{total}</span>
				<div
					class="order-last w-full min-w-0 sm:order-none sm:mx-auto sm:w-auto sm:max-w-md sm:flex-1 sm:px-2"
				>
					<FeedSearch />
				</div>
				<div class="ml-auto flex shrink-0 items-center gap-1">
					<GroupByControl projects={data.projects} hasMilestones={data.options.milestones.length > 0} />
					<FilterPopover options={data.options} />
				</div>
			</header>

			{#if formError}
				<div class="p-2">
					<Alert.Root variant="destructive">
						<Alert.Description>{formError}</Alert.Description>
					</Alert.Root>
				</div>
			{/if}

			{#if entries.length === 0}
				<Empty.Root class="flex-1 border-0">
					<Empty.Description>Inbox zero. Nothing staged or untriaged.</Empty.Description>
				</Empty.Root>
			{:else}
				<div class="issue-list flex min-h-0 flex-1 flex-col">
					<IssueListHeader />
					<div class="issue-feed-scroller min-h-0 flex-1 overflow-y-auto" bind:this={scroller}>
						<Virtualizer
							data={rows}
							getKey={(row) => row.key}
							bind:this={handle}
							onscroll={maybeLoadMore}
							onresize={maybeLoadMore}
						>
							{#snippet children(row)}
								{#if row.kind === 'group'}
									<IssueGroupHeader
										label={row.label}
										count={row.count}
										collapsed={isGroupCollapsed(row.key)}
										ontoggle={() => toggleGroup(row.key)}
									/>
								{:else if row.item.kind === 'submission'}
									<SubmissionRow
										submission={row.item.submission}
										selected={selectedSubmissionId === row.item.submission.id}
									/>
								{:else}
									<IssueRow
										issue={row.item.issue}
										selected={isSelectedIssue(row.item.issue.repo, row.item.issue.number)}
										repoShortcodes={data.repoShortcodes}
										groupedBy={groupBy}
									/>
								{/if}
							{/snippet}
						</Virtualizer>

						{#if inboxFeed.loading}
							<div class="text-muted-foreground px-3 py-2 text-xs" role="status">
								Loading more…
							</div>
						{:else if inboxFeed.error !== null}
							<div class="flex items-center gap-2 px-3 py-2 text-xs">
								<span class="text-destructive">{inboxFeed.error}</span>
								<button
									type="button"
									class="text-foreground underline underline-offset-2"
									onclick={() => void inboxFeed.loadMore()}
								>
									Retry
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet detail()}
		{@render children()}
	{/snippet}
</SplitView>

<style>
	/* Virtua wraps every row in its own element, so a row is always the
	   `:last-child`; restore the divider that the row's `last:border-b-0`
	   would otherwise remove. */
	.issue-feed-scroller :global(.issue-grid:last-child) {
		border-bottom-width: 1px;
	}
</style>
