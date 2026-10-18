<script lang="ts">
	import StatusBoard from '#lib/components/board/StatusBoard.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import { projectBoard, reconcileIssues } from '#lib/client/optimistic.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const board = $derived(projectBoard(data.board));
	const total = $derived(
		board.columns.reduce((sum, column) => sum + column.issues.length, 0)
	);

	// Drop overlays once the authoritative board reflects them.
	$effect(() => reconcileIssues(data.board.columns.flatMap((column) => column.issues)));
</script>

<div class="relative flex min-h-0 min-w-0 flex-1">
	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		<header class="flex h-11 shrink-0 items-center gap-2 border-b px-2">
			<h1 class="text-base font-semibold tracking-tight">Board</h1>
			<span class="mono text-muted-foreground text-xs">{total}</span>
			<span class="text-muted-foreground truncate text-xs max-[980px]:hidden">
				Done: issues closed in the last {data.doneDays} days
			</span>
			<div class="ml-auto flex shrink-0 items-center gap-1">
				<ViewSegment />
				<FilterPopover options={data.options} />
			</div>
		</header>

		<div class="flex shrink-0 items-center gap-2 border-b p-2">
			<div class="min-w-0 flex-1"><FeedSearch /></div>
		</div>

		<StatusBoard {board} />
	</div>

	<!-- The child detail route docks the Inspector beside the grid (the pane
	     styles its own width/borders when not `fill`ed). -->
	{@render children()}
</div>
