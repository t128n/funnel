<script lang="ts">
	import { untrack } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import IssueGroupHeader from './IssueGroupHeader.svelte';
	import IssueListHeader from './IssueListHeader.svelte';
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
	 * Virtualized issue stream. The header stays fixed above the scroller; the
	 * scroller holds a Virtua window over the flattened group/item rows, so only
	 * the visible slice is mounted even with thousands of loaded issues.
	 *
	 * `feed` is the paginated store: near the end of the loaded window the list
	 * asks it for the next page. Callers that already hold a plain array (the
	 * board's Backlog view, a milestone page) can pass `issues` instead; those
	 * views render the same rows without pagination.
	 *
	 * The root is an inline-size query container, so a row switches to its
	 * stacked presentation whenever the available column is narrow — the 26rem
	 * Issues feed as well as a phone — instead of overflowing seven columns.
	 */
	export interface IssueListProps {
		/** Paginated source of truth (Issues feed). */
		feed?: Feed<IssueListItem> | null;
		/** Plain-array fallback for views that are not paginated. */
		issues?: IssueListItem[];
		/** The detail route's issue, highlighted in the feed. */
		selected?: { repo: string; number: number } | null;
		empty?: string;
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
		repoShortcodes = {},
		projects = [],
		groupable = true,
		project = null,
		resetKey = ''
	}: IssueListProps = $props();

	/** How close to the end (px) the scroller must be to fetch the next page. */
	const END_THRESHOLD = 300;

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
	const loadedCount = $derived(source.length);

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

{#snippet retryAction()}
	<Button variant="ghost" size="xs" onclick={() => void feed?.loadMore()}>Retry</Button>
{/snippet}

{#if projected.length === 0}
	<EmptyState title={empty} class="flex-1" />
{:else}
	<div class="issue-feed flex min-h-0 flex-1 flex-col [container-type:inline-size]">
		<IssueListHeader />
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

			{#if feed && feed.loading}
				<p class="px-3 py-2 text-caption text-fg-secondary" role="status">Loading more…</p>
			{:else if feed && feed.error !== null}
				<div class="px-3 py-2">
					<InlineStatus tone="error" message={feed.error} action={retryAction} />
				</div>
			{/if}
		</div>
		<footer
			class="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-subtle px-3 py-1.5 text-caption text-fg-secondary"
		>
			<span class="tabular-nums">{count.toLocaleString()} {count === 1 ? 'issue' : 'issues'}</span>
			{#if feed && loadedCount < count}
				<span class="tabular-nums text-fg-muted">· {loadedCount.toLocaleString()} shown</span>
			{/if}
		</footer>
	</div>
{/if}
