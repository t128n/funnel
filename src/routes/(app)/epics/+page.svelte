<script lang="ts">
	import PageHead from '#lib/components/common/PageHead.svelte';
	import EpicList from '#lib/components/epics/EpicList.svelte';
	import * as Empty from '#lib/components/primitives/empty';
	import type { EpicSummary } from '#lib/server/epics/queries';

	interface PageData {
		epics?: EpicSummary[];
	}

	let { data }: { data: PageData } = $props();

	const epics = $derived(data.epics ?? []);
	const openCount = $derived(epics.filter((epic) => epic.state === 'open').length);
</script>

<PageHead
	title="Epics"
	description="Epics with child progress and estimate, actual and delay rollups."
/>

<div class="surface-shell bg-[var(--background)] flex min-h-0 flex-1 flex-col overflow-y-auto">
	<header
		class="border-[color:var(--border)] flex min-h-11 shrink-0 items-center gap-2 border-b px-3"
	>
		<h1 class="text-base font-semibold tracking-tight">Epics</h1>
		<span class="text-muted-foreground text-xs tabular-nums">
			{openCount} open · {epics.length} total
		</span>
	</header>

	{#if epics.length === 0}
		<Empty.Root class="flex-1 border-0">
			<Empty.Title>No epics yet</Empty.Title>
			<Empty.Description>
				Mark an issue as an epic from its Inspector, then add children here.
			</Empty.Description>
		</Empty.Root>
	{:else}
		<div class="mx-auto flex w-full max-w-4xl flex-col gap-3 p-4">
			<EpicList {epics} />
		</div>
	{/if}
</div>
