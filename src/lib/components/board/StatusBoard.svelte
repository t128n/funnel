<script lang="ts">
	import { onMount } from 'svelte';
	import BoardColumn from './BoardColumn.svelte';
	import { toBoardItem, type BoardItem } from './item';
	import { setKeyboardDragTrigger, type DndEvent } from 'svelte-dnd-action';
	import { moveToStatus } from '#lib/client/issue-actions.svelte';
	import type { StatusBoard as StatusBoardData, UserRef } from '#lib/server/issues/types';

	/**
	 * The active workflow lanes (Backlog is a separate view). Cards drag across
	 * lanes via `svelte-dnd-action`; a drop applies the change optimistically, so
	 * the card lands at once and the projection re-buckets it. Dropping into Done
	 * (or out of it) raises the structured dialog instead of moving immediately.
	 *
	 * Keyboard: `Space` starts a library drag (reorder with arrows, `Space` to
	 * drop); when no drag is active the arrows move a roving focus between cards.
	 */
	interface Props {
		board: StatusBoardData;
		wipLimits?: Record<string, number>;
		doneDays: number;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes: Record<string, string>;
		/** Signed-in viewer for the card's quick assign action. */
		viewer?: UserRef | null;
		/** RBAC `read`: disable dragging and the per-column new-issue link. */
		readonly?: boolean;
	}

	let { board, wipLimits = {}, doneDays, repoShortcodes, viewer = null, readonly = false }: Props = $props();

	const columns = $derived(board.columns.filter((column) => column.key !== 'backlog'));
	const showRepo = $derived(
		new Set(columns.flatMap((column) => column.issues.map((issue) => issue.repo))).size > 1
	);

	/** Local, drag-owned copy of each lane. Re-seeded from the projection. */
	let zones = $state<Record<string, BoardItem[]>>({});
	let dragging = $state(false);

	/** Roving tab stop for arrow-key navigation. */
	let activeKey = $state<string | null>(null);
	let grid = $state<HTMLElement | null>(null);

	$effect(() => {
		const next: Record<string, BoardItem[]> = {};
		for (const column of columns) {
			next[column.key] = column.issues.map(toBoardItem);
		}
		// Never clobber the lanes mid-drag; `finalize` clears the flag and the
		// re-seed catches up with the optimistic projection.
		if (!dragging) zones = next;
	});

	const allKeys = $derived(
		new Set(
			columns.flatMap((column) =>
				column.issues.map((issue) => `${issue.repo}#${issue.number}`)
			)
		)
	);
	const defaultKey = $derived.by(() => {
		for (const column of columns) {
			const first = column.issues[0];
			if (first) return `${first.repo}#${first.number}`;
		}
		return null;
	});
	const effectiveActive = $derived(
		activeKey && allKeys.has(activeKey) ? activeKey : defaultKey
	);

	onMount(() => {
		// Keep `Enter` free for opening a card; `Space` owns the keyboard drag.
		setKeyboardDragTrigger('space');
	});

	function handleConsider(key: string, event: CustomEvent<DndEvent<BoardItem>>) {
		const { items, info } = event.detail;
		dragging = true;
		// The dragged card may still sit in its source lane; keep one copy.
		for (const [other, list] of Object.entries(zones)) {
			if (other === key) continue;
			const index = list.findIndex((item) => item.id === info.id);
			if (index > -1) list.splice(index, 1);
		}
		zones[key] = items;
	}

	function handleFinalize(key: string, event: CustomEvent<DndEvent<BoardItem>>) {
		const { items, info } = event.detail;
		dragging = false;
		zones[key] = items;
		// `finalize` fires on both the receiving lane (which now holds the card)
		// and the origin lane (which no longer does); only the former writes the
		// move, so key off the card's presence rather than the trigger.
		const moved = items.find((item) => item.id === info.id);
		if (moved) void moveToStatus(moved.issue, key);
	}

	function focusCard(element: HTMLElement | undefined) {
		element?.focus();
	}

	function handleFocusIn(event: FocusEvent) {
		const target = event.target as HTMLElement | null;
		const card = target?.closest<HTMLElement>('[data-board-card]');
		const key = card?.dataset.boardCard;
		if (key) activeKey = key;
	}

	/** Arrow-key navigation when the library does not own the keys (no drag). */
	function handleKeydown(event: KeyboardEvent) {
		if (dragging || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
			return;
		}
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
			focusCard(next);
			return;
		}

		const lanes = [...grid.querySelectorAll<HTMLElement>('[data-board-column]')];
		const laneIndex = lanes.indexOf(column);
		const direction = event.key === 'ArrowRight' ? 1 : -1;
		for (let i = laneIndex + direction; i >= 0 && i < lanes.length; i += direction) {
			const nextCards = [...lanes[i].querySelectorAll<HTMLElement>('[data-board-card]')];
			if (nextCards.length > 0) {
				focusCard(nextCards[Math.min(index, nextCards.length - 1)]);
				return;
			}
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={grid}
	class="flex min-h-0 flex-1 gap-0 overflow-x-auto overflow-y-hidden px-3 pt-2 pb-3"
	role="region"
	aria-label="Status board"
	onfocusin={handleFocusIn}
	onkeydown={handleKeydown}
>
	{#each columns as column (column.key)}
		<BoardColumn
			statusKey={column.key}
			label={column.label}
			items={zones[column.key] ?? []}
			limit={wipLimits[column.key]}
			{doneDays}
			{repoShortcodes}
			{showRepo}
			{viewer}
			{readonly}
			activeKey={effectiveActive}
			onconsider={(event) => handleConsider(column.key, event)}
			onfinalize={(event) => handleFinalize(column.key, event)}
		/>
	{/each}
</div>
