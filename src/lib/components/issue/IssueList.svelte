<script lang="ts">
	import { untrack } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import IssueGroupHeader from './IssueGroupHeader.svelte';
	import IssueListHeader from './IssueListHeader.svelte';
	import IssueRow from './IssueRow.svelte';
	import type { ProjectOption } from './grouping';
	import * as Empty from '#lib/components/primitives/empty';
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
	 * The footer carries the filtered total. The plan's `Edit Search` link is
	 * omitted here: the filter UI lives in the route header and this component
	 * receives no handler for it, so inventing one would fork that control.
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

{#if projected.length === 0}
	<Empty.Root class="flex-1 border-0">
		<Empty.Description>{empty}</Empty.Description>
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
				<div class="text-muted-foreground px-3 py-2 text-xs" role="status">Loading more…</div>
			{:else if feed && feed.error !== null}
				<div class="flex items-center gap-2 px-3 py-2 text-xs">
					<span class="text-destructive">{feed.error}</span>
					<button
						type="button"
						class="text-foreground underline underline-offset-2"
						onclick={() => void feed.loadMore()}
					>
						Retry
					</button>
				</div>
			{/if}
		</div>
		<div
			class="bug-chrome-footer text-muted-foreground flex shrink-0 items-center px-3 py-1 text-xs"
		>
			<span>{count} bugs</span>
		</div>
	</div>
{/if}
