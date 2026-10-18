<script lang="ts">
	import StatusBoard from '#lib/components/board/StatusBoard.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const total = $derived(
		data.board.columns.reduce((sum, column) => sum + column.issues.length, 0)
	);
</script>

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

	<StatusBoard board={data.board} />
</div>
