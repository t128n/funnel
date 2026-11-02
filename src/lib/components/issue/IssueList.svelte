<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import IssueGroupHeader from './IssueGroupHeader.svelte';
	import IssueRow from './IssueRow.svelte';
	import type { ProjectOption } from './grouping';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import { Button } from '#lib/components/ui/button';
	import type { Feed } from '#lib/client/feed.svelte';
	import { getGroupBy, isGroupCollapsed, toggleGroup } from '#lib/client/list-prefs.svelte';
	import { flattenIssueRows } from '#lib/feeds';
	import type { IssueListItem } from '#lib/server/issues/types';

	/**
	 * Virtualized issue stream. The page header and toolbar stay stable above
	 * the scroller; the scroller holds a Virtua window over the flattened
	 * group/item rows, so only the visible slice is mounted even with thousands
	 * of loaded issues.
	 *
	 * Rows are the shared two-line presentation: reference + title, then one
	 * metadata line beneath the title. There is no column header and no zebra
	 * fill; 1px rules separate rows.
	 *
	 * `feed` is the paginated store: near the end of the loaded window the list
	 * asks it for the next page. Callers that already hold a plain array (the
	 * board's Backlog view, a milestone page) can pass `issues` instead; those
	 * views render the same rows without pagination.
	 */
	export interface IssueListProps {
		/** Paginated source of truth (Issues feed). */
		feed?: Feed<IssueListItem> | null;
		/** Plain-array fallback for views that are not paginated. */
		issues?: IssueListItem[];
		/** The detail route's issue, highlighted in the feed. */
		selected?: { repo: string; number: number } | null;
		empty?: string;
		/** True when the empty message describes a filtered result set. */
		filtered?: boolean;
		/** Clear the active filters; renders the no-results action when supplied. */
		onclear?: (() => void) | null;
		/** Action for the "nothing yet" state (submit an issue, create a repo). */
		emptyAction?: Snippet;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
		/** Configured project indicators for group-by-project. */
		projects?: ProjectOption[];
		/** The Backlog view is single-status, so sectioning it would be redundant. */
		groupable?: boolean;
		/** Optimistic overlay projection applied to every loaded row. */
		project?: ((issues: IssueListItem[]) => IssueListItem[]) | null;
		/** Changes when the filter changes; resets the scroll position. */
		resetKey?: string;
	}

	let {
		feed = null,
		issues = [],
		selected = null,
		empty = 'Nothing here.',
		filtered = false,
		onclear = null,
		emptyAction,
		repoShortcodes = {},
		projects = [],
		groupable = true,
		project = null,
		resetKey = ''
	}: IssueListProps = $props();

	/** How close to the end (px) the scroller must be to fetch the next page. */
	const END_THRESHOLD = 300;
	const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

	const source = $derived(feed ? feed.items : issues);
	const projected = $derived(project ? project(source) : source);

	const requested = $derived(groupable ? getGroupBy() : 'none');
	// A stored `project` preference with no configured projects renders flat.
	const groupBy = $derived(requested === 'project' && projects.length === 0 ? 'none' : requested);

	const rows = $derived(
		flattenIssueRows(projected, groupBy, repoShortcodes, projects, (key) =>
			isGroupCollapsed(key)
		)
	);

	/** Filtered total, not the loaded window: the footer reports the result set. */
	const count = $derived(feed ? feed.total : issues.length);
	/** Loaded rows in this window; the footer's pagination count. */
	const shown = $derived(source.length);

	// Only an empty window is an initial load; later pages keep the loaded rows
	// on screen and report progress below them.
	const loading = $derived(Boolean(feed && feed.loading && source.length === 0));
	const failed = $derived(Boolean(feed && feed.error !== null && source.length === 0));

	let scroller: HTMLDivElement | undefined = $state();
	let handle: VirtualizerHandle | undefined = $state();

	function isSelected(issue: IssueListItem): boolean {
		return (
			selected !== null &&
			selected.number === issue.number &&
			selected.repo === issue.repo
		);
	}

	/** Fetch the next page once the window is within {@link END_THRESHOLD}. */
	function maybeLoadMore(): void {
		const current = feed;
		if (!current || current.loading || current.error !== null || current.nextCursor === null) {
			return;
		}
		if (!handle) return;
		const remaining =
			handle.getScrollSize() - handle.getViewportSize() - handle.getScrollOffset();
		if (remaining <= END_THRESHOLD) void current.loadMore();
	}

	// A filter change swaps the loaded window; return the reader to the top.
	let lastReset = untrack(() => resetKey);
	$effect(() => {
		const key = resetKey;
		if (key === lastReset) return;
		lastReset = key;
		if (scroller) scroller.scrollTop = 0;
	});
</script>

{#snippet retryInitial()}
	<Button variant="outline" size="sm" onclick={() => void feed?.refreshLoaded()}>Retry</Button>
{/snippet}

{#snippet retryMore()}
	<Button variant="outline" size="sm" onclick={() => void feed?.loadMore()}>Retry</Button>
{/snippet}

{#snippet skeleton()}
	<div class="flex min-h-0 flex-1 flex-col" role="status" aria-label="Loading issues…">
		{#each SKELETON_ROWS as row (row)}
			<div class="issue-skeleton-row" aria-hidden="true">
				<span class="skeleton-ref"></span>
				<span class="skeleton-title"></span>
				<span class="skeleton-meta"></span>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet noResults()}
	{#if filtered && onclear}
		<EmptyState
			title={empty}
			class="flex-1 items-start justify-start text-left"
		>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={onclear}>Clear Filters</Button>
			{/snippet}
		</EmptyState>
	{:else if emptyAction}
		<EmptyState
			title={empty}
			class="flex-1 items-start justify-start text-left"
			action={emptyAction}
		/>
	{:else}
		<EmptyState title={empty} class="flex-1 items-start justify-start text-left" />
	{/if}
{/snippet}

<div class="issue-feed flex min-h-0 flex-1 flex-col">
	{#if loading}
		{@render skeleton()}
	{:else if failed}
		<div class="min-h-0 flex-1 px-3 py-4">
			<InlineStatus
				tone="error"
				message={feed?.error ?? 'Could not load issues.'}
				action={retryInitial}
			/>
		</div>
	{:else if projected.length === 0}
		{@render noResults()}
	{:else}
		<div class="min-h-0 flex-1 overflow-y-auto" bind:this={scroller}>
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
							{repoShortcodes}
							selected={isSelected(row.item)}
							groupedBy={groupBy}
							{index}
						/>
					{/if}
				{/snippet}
			</Virtualizer>
		</div>

		{#if feed && feed.error !== null}
			<div class="shrink-0 border-t border-border-subtle px-3 py-2">
				<InlineStatus tone="error" message={feed.error} action={retryMore} />
			</div>
		{:else if feed && feed.loading}
			<p class="shrink-0 border-t border-border-subtle px-3 py-2 text-caption text-fg-secondary" role="status">
				Loading more…
			</p>
		{/if}
	{/if}

	{#if !loading && !failed}
		<footer
			class="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-subtle px-3 py-1.5 text-caption text-fg-secondary"
		>
			<span class="tabular-nums">{count.toLocaleString()} {count === 1 ? 'issue' : 'issues'}</span>
			{#if feed && shown < count}
				<span class="tabular-nums text-fg-muted">· {shown.toLocaleString()} shown</span>
			{/if}
		</footer>
	{/if}
</div>

<style>
	.issue-skeleton-row {
		--issue-ref-column: calc(var(--space-7) + var(--space-6) + var(--space-2));
		display: grid;
		grid-template-columns: var(--issue-ref-column) minmax(0, 1fr);
		grid-template-areas:
			'ref title'
			'. meta';
		align-items: center;
		min-height: var(--size-row-comfortable);
		column-gap: var(--space-3);
		row-gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.skeleton-ref,
	.skeleton-title,
	.skeleton-meta {
		display: block;
		height: var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--color-surface-2);
	}

	.skeleton-ref {
		grid-area: ref;
		width: calc(var(--issue-ref-column) - var(--space-2));
		height: var(--space-2);
	}

	.skeleton-title {
		grid-area: title;
		width: 62%;
	}

	.skeleton-meta {
		grid-area: meta;
		width: 46%;
		height: var(--space-2);
	}
</style>
