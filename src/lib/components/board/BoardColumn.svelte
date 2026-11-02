<script lang="ts">
	import { tick } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import BoardCard from './BoardCard.svelte';
	import { droppableLane, type LaneHandlers } from './dnd';
	import { Button } from '#lib/components/ui/button';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import type { IssueListItem, UserRef } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	/**
	 * One workflow lane: a ruled `--layout-board-lane` column on the canvas.
	 *
	 * The lane is its own scroll container (the header stays fixed) and the
	 * cards inside it are virtualized with Virtua, so a 500-card lane mounts
	 * only the visible window. Because the DOM no longer maps one-to-one onto
	 * the lane's items, drag-and-drop is handled by `dnd.ts` (pragmatic DnD)
	 * rather than a DOM-reordering library: the lane resolves the drop slot
	 * from the rendered card rectangles and forwards the *virtual* index.
	 */
	interface Props {
		/** Column identity: canonical status key (`done` is the closed window). */
		statusKey: string;
		label: string;
		/** Cards loaded so far, already in server order. */
		items: IssueListItem[];
		/** Server total for the lane (WIP count / done-window size). */
		total: number;
		/** Cursor for the next page, or `null` at the end of the lane. */
		nextCursor: string | null;
		/** A page request is in flight. */
		loading: boolean;
		/** Last page request failed; the lane offers a retry. */
		error?: string | null;
		/** Fetch the next page; called once when the lane nears its end. */
		onLoadMore: () => void;
		/** Drop a card at a virtual index within this lane. */
		onDrop: (issueKey: string, index: number) => void;
		/** Card key that owns the roving tab stop for this column. */
		activeKey?: string | null;
		/** Card key currently being dragged anywhere on the board. */
		draggingKey?: string | null;
		/** Card key of the docked detail, marked with a 2px leading bar. */
		selectedKey?: string | null;
		/** Optional Work-in-Progress cap; `undefined` means unlimited. */
		limit?: number;
		/** Done retention window, surfaced as the Done column's tooltip. */
		doneDays?: number;
		/** `owner/name` → project key, forwarded to every card. */
		repoShortcodes?: Record<string, string>;
		/** Show the repository context tag when the board spans multiple repos. */
		showRepo?: boolean;
		/** Signed-in viewer for the card's quick assign action. */
		viewer?: UserRef | null;
		/** RBAC `read`: disables dragging and the column's new-issue link. */
		readonly?: boolean;
	}

	let {
		statusKey,
		label,
		items,
		total,
		nextCursor,
		loading,
		error = null,
		onLoadMore,
		onDrop,
		activeKey = null,
		draggingKey = null,
		selectedKey = null,
		limit,
		doneDays,
		repoShortcodes = {},
		showRepo = false,
		viewer = null,
		readonly = false
	}: Props = $props();

	/** Pixels from the bottom at which the next page is requested. */
	const LOAD_MORE_THRESHOLD = 320;

	const isDone = $derived(statusKey === 'done');
	const overLimit = $derived(limit !== undefined && total > limit);
	const empty = $derived(items.length === 0 && !loading && !error);

	let scroller = $state<HTMLElement | null>(null);
	let virtualizer = $state<VirtualizerHandle | null>(null);
	/** Virtual index of the drop line, or `null` when not hovering. */
	let indicator = $state<number | null>(null);
	/** Guards against a burst of scroll events issuing several page requests. */
	let loadRequested = $state(false);

	/** A drag is hovering this lane; the body takes `surface-2`. */
	const isDropTarget = $derived(indicator !== null);

	const cardKey = (issue: IssueListItem) => `${issue.repo}#${issue.number}`;

	/** Keep the roving tab stop mounted even when it scrolls out of the window. */
	const activeIndex = $derived(items.findIndex((item) => cardKey(item) === activeKey));

	/** Drop line position in the lane's scroll content. */
	const indicatorTop = $derived.by(() => {
		if (indicator === null) return null;
		if (!virtualizer) return 0;
		if (indicator >= items.length) return virtualizer.getScrollSize();
		return virtualizer.getItemOffset(indicator);
	});

	// A fresh page arrived (or the request failed): allow the next near-end
	// scroll to ask again.
	$effect(() => {
		if (!loading) loadRequested = false;
	});

	function maybeLoadMore() {
		if (error || loading || loadRequested || nextCursor === null) return;
		loadRequested = true;
		onLoadMore();
	}

	function handleScroll() {
		const element = scroller;
		if (!element) return;
		const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
		if (remaining <= LOAD_MORE_THRESHOLD) maybeLoadMore();
	}

	// A short lane (or one whose first page did not fill the viewport) should
	// keep loading until it can scroll, so infinite scroll also works without
	// a wheel gesture.
	$effect(() => {
		items.length;
		nextCursor;
		loading;
		error;
		if (loading || error || nextCursor === null) return;
		void tick().then(() => {
			const element = scroller;
			if (!element) return;
			if (element.scrollHeight <= element.clientHeight + LOAD_MORE_THRESHOLD) {
				maybeLoadMore();
			}
		});
	});

	/** Live callbacks for the drop-target action (props stay reactive). */
	const laneHandlers = $derived<LaneHandlers>({
		columnKey: statusKey,
		canDrop: () => !readonly,
		onIndicator: (index) => (indicator = index),
		onDrop: (issueKey, index) => onDrop(issueKey, index)
	});
</script>

<section
	class="group/column flex min-h-0 w-[var(--layout-board-lane)] max-w-full shrink-0 snap-start flex-col overflow-hidden rounded-md border border-border-subtle bg-canvas"
	aria-label={label}
	data-board-column={statusKey}
	title={isDone && doneDays !== undefined ? `Issues closed in the last ${doneDays} days` : undefined}
>
	<!-- Fixed header cell: stage, count, and WIP; the lane scrolls below it. -->
	<header
		class="flex min-h-9 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-subtle bg-surface-2 px-3 py-1.5"
	>
		<h2 class="min-w-0 flex-1 truncate text-body font-semibold text-fg">{label}</h2>
		{#if limit !== undefined}
			<span
				class={cn(
					'text-caption tabular-nums',
					overLimit ? 'font-semibold text-warning' : 'text-fg-secondary'
				)}
				title={`${total} of ${limit} (WIP limit)`}
			>
				{total} / {limit}
			</span>
			{#if overLimit}
				<span class="status status-warning">
					<TriangleAlertIcon aria-hidden="true" />
					<span>Over WIP</span>
				</span>
			{/if}
		{:else}
			<span class="mono shrink-0 text-caption text-fg-secondary tabular-nums" title={`${total} issues`}>
				{total}
			</span>
		{/if}
	</header>

	<!-- The lane's own scroller. Virtua measures the cards inside it; the drop
	     target and auto-scroll attach here so dragging works while scrolled. -->
	<div
		bind:this={scroller}
		class={cn(
			'relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2',
			isDropTarget && 'bg-surface-2'
		)}
		use:droppableLane={laneHandlers}
		onscroll={handleScroll}
	>
		<Virtualizer
			bind:this={virtualizer}
			data={items}
			getKey={(item) => cardKey(item)}
			keepMounted={activeIndex >= 0 ? [activeIndex] : []}
		>
			{#snippet children(item, index)}
				<div class="pb-2" data-board-card-index={index}>
					<BoardCard
						issue={item}
						columnKey={statusKey}
						{repoShortcodes}
						{showRepo}
						{viewer}
						selected={selectedKey === cardKey(item)}
						tabIndex={cardKey(item) === activeKey ? 0 : -1}
						dragging={draggingKey === cardKey(item)}
						{readonly}
					/>
				</div>
			{/snippet}
		</Virtualizer>

		{#if empty}
			<div
				class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center"
			>
				<p class="text-caption text-fg-secondary">No issues</p>
				{#if !readonly}
					<Button
						href="/intake"
						variant="ghost"
						size="sm"
						class="pointer-events-auto"
					>
						New Issue
					</Button>
				{/if}
			</div>
		{/if}

		{#if indicatorTop !== null}
			<div
				class="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-primary"
				style:top={`${indicatorTop}px`}
				aria-hidden="true"
				data-board-drop-indicator
			></div>
		{/if}

		{#if loading}
			<div class="flex items-center justify-center py-3" role="status">
				<span class="text-caption text-fg-secondary">Loading…</span>
			</div>
		{/if}

		{#if error}
			<div class="px-1 py-2">
				<InlineStatus tone="error" message={error}>
					{#snippet action()}
						<Button variant="ghost" size="xs" onclick={onLoadMore} disabled={loading}>
							Retry
						</Button>
					{/snippet}
				</InlineStatus>
			</div>
		{/if}
	</div>
</section>
