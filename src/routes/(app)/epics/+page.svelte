<script lang="ts">
	import PageHead from '#lib/components/common/PageHead.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import EpicList from '#lib/components/epics/EpicList.svelte';
	import { Button } from '#lib/components/ui/button';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import type { EpicSummary } from '#lib/server/epics/queries';

	interface PageData {
		epics?: EpicSummary[];
	}

	let { data }: { data: PageData } = $props();

	const epics = $derived(data.epics ?? []);
	const openCount = $derived(epics.filter((epic) => epic.state === 'open').length);
</script>

<PageHead title="Epics" />

<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
	<PageHeader title="Epics" count={`${openCount} open · ${epics.length} total`} />

	{#if epics.length === 0}
		<EmptyState
			title="No epics yet."
			description="Mark an issue as an epic from its Inspector, then add children here."
			class="flex-1"
		>
			{#snippet action()}
				<Button variant="outline" href="/issues">View Issues</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="px-[var(--layout-page-padding)] pb-8">
			<EpicList {epics} />
		</div>
	{/if}
</div>
