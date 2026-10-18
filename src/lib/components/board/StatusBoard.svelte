<script lang="ts">
	import BoardColumn from './BoardColumn.svelte';
	import { toBoardItem, type BoardItem } from './item';
	import type { DndEvent } from 'svelte-dnd-action';
	import { moveToStatus } from '#lib/client/issue-actions.svelte';
	import type { StatusBoard as StatusBoardData } from '#lib/server/issues/types';

	/**
	 * The active workflow lanes (Backlog is a separate view). Cards drag across
	 * lanes via `svelte-dnd-action`; a drop applies the change optimistically, so
	 * the card lands at once and the projection re-buckets it. Dropping into Done
	 * (or out of it) raises the structured dialog instead of moving immediately.
	 */
	interface Props {
		board: StatusBoardData;
		wipLimits?: Record<string, number>;
		doneDays: number;
	}

	let { board, wipLimits = {}, doneDays }: Props = $props();

	const columns = $derived(board.columns.filter((column) => column.key !== 'backlog'));

	/** Local, drag-owned copy of each lane. Re-seeded from the projection. */
	let zones = $state<Record<string, BoardItem[]>>({});
	let dragging = $state(false);

	$effect(() => {
		const next: Record<string, BoardItem[]> = {};
		for (const column of columns) {
			next[column.key] = column.issues.map(toBoardItem);
		}
		// Never clobber the lanes mid-drag; `finalize` clears the flag and the
		// re-seed catches up with the optimistic projection.
		if (!dragging) zones = next;
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
</script>

<div
	class="flex min-h-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden p-2"
	role="region"
	aria-label="Status board"
>
	{#each columns as column (column.key)}
		<BoardColumn
			statusKey={column.key}
			label={column.label}
			items={zones[column.key] ?? []}
			limit={wipLimits[column.key]}
			doneDays={doneDays}
			onconsider={(event) => handleConsider(column.key, event)}
			onfinalize={(event) => handleFinalize(column.key, event)}
		/>
	{/each}
</div>
