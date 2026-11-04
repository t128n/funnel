<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import Breadcrumbs from '#lib/components/shell/Breadcrumbs.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import EpicList from '#lib/components/epics/EpicList.svelte';
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

<main class="container-xl py-4">
	<Breadcrumbs items={[{ label: 'Workspace', href: '/issues' }, { label: 'Epics' }]} />

	<PageHeader title="Epics" count={`${openCount} open · ${epics.length} total`} />

	{#if epics.length === 0}
		<EmptyState
			title="No epics yet."
			description="Mark an issue as an epic from its Inspector, then add children here."
			class="border-top border-bottom py-5"
		>
			{#snippet action()}
				<Button color="outline-secondary" href="/issues">View Issues</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<EpicList {epics} />
	{/if}
</main>
