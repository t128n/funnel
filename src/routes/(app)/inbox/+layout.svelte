<script lang="ts">
	import { untrack } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import { page } from '$app/state';
	import { Button } from '@sveltestrap/sveltestrap';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import IssueGroupHeader from '#lib/components/issue/IssueGroupHeader.svelte';
	import IssueListHeader from '#lib/components/issue/IssueListHeader.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import SplitView from '#lib/components/shell/SplitView.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import SubmissionRow from '#lib/components/inbox/SubmissionRow.svelte';
	import IssueRow from '#lib/components/issue/IssueRow.svelte';
	import { createFeed } from '#lib/client/feed.svelte';
	import { isGroupCollapsed, toggleGroup } from '#lib/client/list-prefs.svelte';
	import {
		projectInboxEntries,
		reconcileIssues,
		reconcileSubmissions
	} from '#lib/client/optimistic.svelte';
	import { FEED_ENDPOINTS, flattenIssueRows } from '#lib/feeds';
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
	const submissions = $derived(
		entries.filter(
			(entry): entry is Extract<RenderedInboxEntry, { kind: 'submission' }> =>
				entry.kind === 'submission'
		)
	);
	const issues = $derived(
		entries.flatMap((entry) => (entry.kind === 'issue' ? [entry.issue] : []))
	);

	// Inbox is already one status bucket (untriaged), so grouping would only
	// repeat the section heading. Keep the queue flat.
	const rows = $derived(
		flattenIssueRows(issues, 'none', data.repoShortcodes, data.projects, () => false)
	);

	// The server total covers the whole queue; the optimistic projection may
	// hide loaded rows, so subtract exactly those from the head count.
	const hidden = $derived(Math.max(0, inboxFeed.items.length - entries.length));
	const total = $derived(Math.max(0, inboxFeed.total - hidden));
	const untriagedTotal = $derived(Math.max(0, total - submissions.length));

	function countOf(count: number, noun: string): string {
		return `${count} ${noun}${count === 1 ? '' : 's'}`;
	}

	const summary = $derived(
		`${countOf(submissions.length, 'submission')} · ${countOf(untriagedTotal, 'untriaged issue')}`
	);

	// The open issue and staged submission are route params.
	const selectedIssue = $derived(parseIssueParams(page.params as IssueParams));
	const selectedSubmissionId = $derived(
		(page.params as { id?: string }).id ?? null
	);

	// Drop overlays and submission hides once the authoritative queue reflects
	// them; a stale refresh leaves them in place.
	$effect(() => {
		const issueItems: IssueListItem[] = [];
		const submissionIds: string[] = [];
		for (const entry of data.inbox.items) {
			if (entry.kind === 'issue') issueItems.push(entry.issue);
			else submissionIds.push(entry.submission.id);
		}
		reconcileIssues(issueItems);
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
		<div class="d-flex min-h-0 flex-grow-1 flex-column overflow-y-auto bg-body">
			<PageHeader
				title="Inbox"
				count={summary}
				level={selectedIssue !== null || selectedSubmissionId !== null ? 2 : 1}
			/>

			<Toolbar>
				<div class="min-w-0 flex-grow-1">
					<FeedSearch />
				</div>
				{#snippet actions()}
					<FilterPopover options={data.options} />
				{/snippet}
			</Toolbar>

			{#if formError}
				<div class="border-bottom px-3 py-2">
					<InlineStatus tone="error" message={formError} />
				</div>
			{/if}

			{#if entries.length === 0}
				<EmptyState
					title="Inbox zero"
					description="Nothing staged or untriaged."
					class="flex-grow-1 px-3"
				>
					{#snippet action()}
						<Button color="outline-secondary" size="sm" href="/issues">
							View all issues
						</Button>
					{/snippet}
				</EmptyState>
			{:else}
				<div class="inbox-scroll flex-grow-1 overflow-y-auto" bind:this={scroller}>
					{#if submissions.length > 0}
						<section aria-labelledby="inbox-submissions-heading">
							<div class="d-flex align-items-center justify-content-between gap-2 px-3 pb-1 pt-3">
								<h2
									id="inbox-submissions-heading"
									class="small fw-semibold text-body-secondary mb-0"
								>
									Submissions
								</h2>
								<span class="small text-body-tertiary tabular">
									{submissions.length}
								</span>
							</div>

							<div
								class="submissions-header d-flex align-items-center gap-3 border-top border-bottom bg-body-secondary px-3 small fw-semibold text-body"
								aria-hidden="true"
							>
								<span class="submission-source flex-shrink-0">Source</span>
								<span class="min-w-0 flex-grow-1">Title</span>
								<span class="submission-received flex-shrink-0 text-end">Received</span>
							</div>

							{#each submissions as entry (entry.submission.id)}
								<SubmissionRow
									submission={entry.submission}
									selected={selectedSubmissionId === entry.submission.id}
								/>
							{/each}
						</section>
					{/if}

					{#if issues.length > 0}
						<section
							style="container-type: inline-size"
							aria-labelledby="inbox-issues-heading"
						>
							<div class="d-flex align-items-center justify-content-between gap-2 px-3 pb-1 pt-3">
								<h2
									id="inbox-issues-heading"
									class="small fw-semibold text-body-secondary mb-0"
								>
									Untriaged Issues
								</h2>
								<span class="small text-body-tertiary tabular">
									{untriagedTotal}
								</span>
							</div>

							<IssueListHeader class="sticky-top" />

							<Virtualizer
								data={rows}
								getKey={(row) => row.key}
								bind:this={handle}
								onscroll={maybeLoadMore}
								onresize={maybeLoadMore}
							>
								{#snippet children(row, index)}
									{#if row.kind === 'group'}
										<IssueGroupHeader
											label={row.label}
											count={row.count}
											collapsed={isGroupCollapsed(row.key)}
											ontoggle={() => toggleGroup(row.key)}
										/>
									{:else}
										<IssueRow
											issue={row.item}
											selected={isSelectedIssue(
												row.item.repo,
												row.item.number
											)}
											repoShortcodes={data.repoShortcodes}
											groupedBy="status"
											{index}
										/>
									{/if}
								{/snippet}
							</Virtualizer>
						</section>
					{/if}

					{#if inboxFeed.loading}
						<div class="border-top px-3 py-2">
							<InlineStatus tone="info" message="Loading more…" />
						</div>
					{:else if inboxFeed.error !== null}
						<div class="border-top px-3 py-2">
							<InlineStatus tone="error" message={inboxFeed.error}>
								{#snippet action()}
									<Button
										color="link"
										size="sm"
										onclick={() => void inboxFeed.loadMore()}
									>
										Retry
									</Button>
								{/snippet}
							</InlineStatus>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet detail()}
		{@render children()}
	{/snippet}
</SplitView>

<style>
	.inbox-scroll {
		min-height: 30svh;
	}

	.submissions-header {
		min-height: var(--funnel-row-compact);
	}

	.submission-source {
		width: 6rem;
	}

	.submission-received {
		width: 5rem;
	}

	.tabular {
		font-variant-numeric: tabular-nums;
	}
</style>
