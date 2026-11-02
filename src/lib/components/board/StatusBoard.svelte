<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import BoardColumn from './BoardColumn.svelte';
	import { isCardDragData, type CardDragData } from './dnd';
	import { moveToStatus } from '#lib/client/issue-actions.svelte';
	import { createKeyboardMove } from '#lib/client/board-keyboard.svelte';
	import type { BoardProjection } from '#lib/client/board-feed.svelte';
	import type { IssueListItem, UserRef } from '#lib/server/issues/types';

	/**
	 * The active workflow lanes (Backlog is a separate view). Cards drag across
	 * lanes with `@atlaskit/pragmatic-drag-and-drop`; a drop applies the change
	 * optimistically, so the card lands at once and the projection re-buckets
	 * it. Dropping into Done (or out of it) raises the structured dialog instead
	 * of moving immediately.
	 *
	 * Keyboard: `Space` picks the focused card up (reorder with the arrows,
	 * `Space`/`Enter` to drop, `Escape` to cancel); when no move is active the
	 * arrows move a roving focus between cards. Both modes work off the data
	 * model, so they survive virtualization.
	 */
	interface Props {
		/** Projected lanes carrying each lane's total, cursor, and fetch state. */
		board: BoardProjection;
		wipLimits?: Record<string, number>;
		doneDays: number;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes: Record<string, string>;
		/** Signed-in viewer for the card's quick assign action. */
		viewer?: UserRef | null;
		/** The docked detail's issue, highlighted with a 2px leading bar. */
		selected?: { repo: string; number: number } | null;
		/** RBAC `read`: disable dragging and the per-column new-issue link. */
		readonly?: boolean;
	}

	let {
		board,
		wipLimits = {},
		doneDays,
		repoShortcodes,
		viewer = null,
		selected = null,
		readonly = false
	}: Props = $props();

	const columns = $derived(board.columns.filter((column) => column.key !== 'backlog'));
	const selectedKey = $derived(selected ? `${selected.repo}#${selected.number}` : null);

	/** Identity shared with `data-board-card`. */
	function cardKey(issue: IssueListItem): string {
		return `${issue.repo}#${issue.number}`;
	}

	/** Local, drag-owned copy of each lane. Re-seeded from the projection. */
	let zones = $state<Record<string, IssueListItem[]>>({});
	/** A pointer drag is in flight. */
	let dragging = $state(false);
	/** Card currently picked up by a pointer drag, for dimming. */
	let draggingKey = $state<string | null>(null);

	/** Roving tab stop for arrow-key navigation. */
	let activeKey = $state<string | null>(null);
	let grid = $state<HTMLElement | null>(null);

	/**
	 * Cheap content revision of the projection. The lanes only re-seed when this
	 * changes, so a local (same-lane) reorder is not clobbered by the next
	 * unrelated render while an optimistic move still lands.
	 */
	let seeded = false;
	let lastRevision = -1;

	/** Re-seed the lanes from the authoritative projection. */
	function seedFromBoard() {
		const next: Record<string, IssueListItem[]> = {};
		for (const column of columns) next[column.key] = column.issues.map((issue) => issue);
		zones = next;
		lastRevision = board.revision;
		seeded = true;
	}

	const keyboard = createKeyboardMove({
		zones: () => zones,
		setZones: (next) => (zones = next),
		columns: () => columns,
		activeKey: () => activeKey,
		setActiveKey: (key) => (activeKey = key),
		keyOf: cardKey,
		// A keyboard lane change is the only write: same-lane reorders stay local.
		onCommit: (issue, _from, to) =>
			void moveToStatus(issue, to).then((ok) => {
				// A dialog flow (Done) or a failed write never applied an overlay,
				// so the optimistic local move must be undone.
				if (!ok) seedFromBoard();
			})
	});

	$effect(() => {
		const revision = board.revision;
		// Never clobber the lanes mid-drag or mid-move; once the flag clears the
		// effect re-runs and catches up with the projection if it changed.
		if (dragging || keyboard.active) return;
		if (seeded && revision === lastRevision) return;
		seedFromBoard();
	});

	const allKeys = $derived(
		new Set(
			Object.values(zones).flatMap((items) => items.map((issue) => cardKey(issue)))
		)
	);
	const defaultKey = $derived.by(() => {
		for (const column of columns) {
			const first = zones[column.key]?.[0];
			if (first) return cardKey(first);
		}
		return null;
	});
	const effectiveActive = $derived(activeKey && allKeys.has(activeKey) ? activeKey : defaultKey);

	onMount(() => {
		// Track the pointer drag from the monitor rather than every card, so one
		// listener covers a virtualized board and the lanes know what to dim.
		return monitorForElements({
			canMonitor: ({ source }) => isCardDragData(source.data),
			onDragStart: ({ source }) => {
				if (!isCardDragData(source.data)) return;
				keyboard.cancel();
				dragging = true;
				draggingKey = (source.data as CardDragData).issueKey;
			},
			onDrop: () => {
				dragging = false;
				draggingKey = null;
			}
		});
	});

	/** Move a card between/within lanes. Lanes reseed from the projection after. */
	function handleDrop(issueKey: string, targetColumn: string, index: number) {
		if (readonly) return;
		let sourceColumn: string | null = null;
		let sourceIndex = -1;
		for (const [lane, items] of Object.entries(zones)) {
			const at = items.findIndex((issue) => cardKey(issue) === issueKey);
			if (at >= 0) {
				sourceColumn = lane;
				sourceIndex = at;
				break;
			}
		}
		if (sourceColumn === null || sourceIndex < 0) {
			dragging = false;
			draggingKey = null;
			return;
		}

		const moved = zones[sourceColumn][sourceIndex];
		const next: Record<string, IssueListItem[]> = {};
		for (const [lane, items] of Object.entries(zones)) next[lane] = items.slice();
		next[sourceColumn].splice(sourceIndex, 1);

		let target = index;
		if (sourceColumn === targetColumn && sourceIndex < index) target -= 1;
		const targetLane = next[targetColumn] ?? (next[targetColumn] = []);
		targetLane.splice(Math.max(0, Math.min(target, targetLane.length)), 0, moved);

		zones = next;
		activeKey = issueKey;
		dragging = false;
		draggingKey = null;
		// Same-lane reorders never touch the server.
		if (sourceColumn !== targetColumn) {
			void moveToStatus(moved, targetColumn).then((ok) => {
				// Done raises a dialog and a failed write rolls back: neither left
				// an overlay, so the local move is reverted.
				if (!ok) seedFromBoard();
			});
		}
	}

	/** Focus the card after a move, once Virtua has mounted it. */
	async function focusCard(key: string | null | undefined) {
		if (!key || !grid) return;
		await tick();
		const element = [...grid.querySelectorAll<HTMLElement>('[data-board-card]')].find(
			(card) => card.dataset.boardCard === key
		);
		if (!element) return;
		element.scrollIntoView({ block: 'nearest' });
		element.focus({ preventScroll: true });
	}

	function handleFocusIn(event: FocusEvent) {
		const target = event.target as HTMLElement | null;
		const card = target?.closest<HTMLElement>('[data-board-card]');
		const key = card?.dataset.boardCard;
		if (key) activeKey = key;
	}

	/**
	 * Capture handler for the keyboard move mode. Runs before the focused card
	 * so `Space`/arrows never reach the card's own `Enter`-to-open behaviour.
	 */
	function handleMoveKeydown(event: KeyboardEvent) {
		if (readonly || dragging) return;
		if (event.altKey || event.ctrlKey || event.metaKey) return;

		if (keyboard.active) {
			if (!keyboard.handleKey(event)) return;
			event.preventDefault();
			event.stopPropagation();
			void focusCard(keyboard.key);
			return;
		}

		// `Space` picks the focused card up; a card's nested controls keep theirs.
		if (event.key !== ' ') return;
		const target = event.target as HTMLElement | null;
		const card = target?.closest<HTMLElement>('[data-board-card]') ?? null;
		if (target && card && target !== card) return;
		const key = card?.dataset.boardCard ?? effectiveActive;
		if (!key || !allKeys.has(key)) return;
		event.preventDefault();
		event.stopPropagation();
		keyboard.start(key);
		void focusCard(keyboard.key);
	}

	/** Arrow-key navigation when no move is active. */
	function handleKeydown(event: KeyboardEvent) {
		if (dragging || keyboard.active || event.defaultPrevented) return;
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const arrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
		if (!arrow) return;

		const target = event.target as HTMLElement | null;
		const card = target?.closest<HTMLElement>('[data-board-card]');
		const column = card?.closest<HTMLElement>('[data-board-column]');
		if (!card || !column || !grid) return;

		event.preventDefault();
		const cards = [...column.querySelectorAll<HTMLElement>('[data-board-card]')];
		const index = cards.indexOf(card);

		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			const next = event.key === 'ArrowUp' ? cards[index - 1] : cards[index + 1];
			next?.focus();
			return;
		}

		const lanes = [...grid.querySelectorAll<HTMLElement>('[data-board-column]')];
		const laneIndex = lanes.indexOf(column);
		const direction = event.key === 'ArrowRight' ? 1 : -1;
		for (let i = laneIndex + direction; i >= 0 && i < lanes.length; i += direction) {
			const nextCards = [...lanes[i].querySelectorAll<HTMLElement>('[data-board-card]')];
			if (nextCards.length > 0) {
				nextCards[Math.min(index, nextCards.length - 1)]?.focus();
				return;
			}
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={grid}
	class="flex min-h-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden scroll-pl-[var(--layout-page-padding)] px-[var(--layout-page-padding)] py-4 md:snap-none"
	role="region"
	aria-label="Status board"
	data-keyboard-move={keyboard.active}
	onfocusin={handleFocusIn}
	onkeydowncapture={handleMoveKeydown}
	onkeydown={handleKeydown}
>
	{#each columns as column (column.key)}
		<BoardColumn
			statusKey={column.key}
			label={column.label}
			items={zones[column.key] ?? []}
			total={column.total}
			nextCursor={column.nextCursor}
			loading={column.loading}
			error={column.error}
			onLoadMore={column.loadMore}
			onDrop={(issueKey, index) => handleDrop(issueKey, column.key, index)}
			limit={wipLimits[column.key]}
			{doneDays}
			{repoShortcodes}
			{viewer}
			{selectedKey}
			{readonly}
			activeKey={effectiveActive}
			draggingKey={draggingKey}
		/>
	{/each}

	<p class="sr-only" role="status" aria-live="polite">{keyboard.message}</p>
</div>
