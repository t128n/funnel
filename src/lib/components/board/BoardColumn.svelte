<script lang="ts">
	import { tick } from 'svelte';
	import { Virtualizer, type VirtualizerHandle } from 'virtua/svelte';
	import BoardCard from './BoardCard.svelte';
	import { droppableLane, type LaneHandlers } from './dnd';
	import type { IssueListItem, UserRef } from '#lib/server/issues/types';
	import { Button } from '#lib/components/primitives/button';
	import { cn } from '#lib/utils';

	/**
	 * One workflow lane, drawn as a Bugzilla frame: a 1px border around a flat
	 * card-coloured body with a grey header cell (uppercase lane name left,
	 * `(count)` right, `+ New` revealed on hover).
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
	class="group/column flex min-h-0 w-[19rem] shrink-0 flex-col overflow-hidden border border-[color:var(--border)] bg-[var(--card)] shadow-none"
	aria-label={label}
	data-board-column={statusKey}
	title={isDone && doneDays !== undefined ? `Issues closed in the last ${doneDays} days` : undefined}
>
	<!-- Fixed header cell: the lane's scroll happens below this grey bar. -->
	<header class="flex h-7 shrink-0 items-center gap-2 border-b border-border bg-[var(--muted)] px-2">
		<span class="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide uppercase">
			{label}
		</span>
		{#if !isDone && !readonly}
			<a
				href="/intake"
				class="link shrink-0 text-xs opacity-100 transition-opacity md:opacity-0 md:group-hover/column:opacity-100 md:group-focus-within/column:opacity-100"
				title="New issue"
				aria-label={`New issue in ${label}`}
			>
				+ New
			</a>
		{/if}
		<span
			class={cn('mono text-muted-foreground shrink-0 text-xs', overLimit && 'text-warning font-medium')}
			title={limit !== undefined ? `${total} of ${limit} (WIP limit)` : undefined}
		>
			({total}{limit !== undefined ? ` / ${limit}` : ''})
		</span>
	</header>

	<!-- The lane's own scroller. Virtua measures the cards inside it; the drop
	     target and auto-scroll attach here so dragging works while scrolled. -->
	<div
		bind:this={scroller}
		class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2 pb-2"
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
				<div class="pb-1.5" data-board-card-index={index}>
					<BoardCard
						issue={item}
						columnKey={statusKey}
						{repoShortcodes}
						{showRepo}
						{viewer}
						tabIndex={cardKey(item) === activeKey ? 0 : -1}
						dragging={draggingKey === cardKey(item)}
						{readonly}
					/>
				</div>
			{/snippet}
		</Virtualizer>

		{#if empty}
			<div
				class="text-muted-foreground pointer-events-none absolute inset-x-0 top-0 flex items-start justify-center pt-6 text-xs"
			>
				No issues
			</div>
		{/if}

		{#if indicatorTop !== null}
			<div
				class="bg-primary pointer-events-none absolute inset-x-0 z-10 h-0.5"
				style:top={`${indicatorTop}px`}
				aria-hidden="true"
				data-board-drop-indicator
			></div>
		{/if}

		{#if loading}
			<div class="text-muted-foreground flex items-center justify-center py-3 text-xs" role="status">
				Loading…
			</div>
		{/if}

		{#if error}
			<div class="text-destructive flex items-center justify-center gap-2 py-3 text-xs" role="alert">
				<span class="min-w-0 truncate">{error}</span>
				<Button variant="ghost" size="xs" class="shrink-0" onclick={onLoadMore} disabled={loading}>
					Retry
				</Button>
			</div>
		{/if}
	</div>
</section>
