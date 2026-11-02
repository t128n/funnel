<script lang="ts">
	import { goto } from '$app/navigation';
	import FlagIcon from '@lucide/svelte/icons/flag';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import TimelineChart from '#lib/components/timeline/TimelineChart.svelte';
	import { Button } from '#lib/components/ui/button';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const total = $derived(data.timeline.rows.length + data.timeline.undated.length);
	const selectedRepo = $derived(
		data.repo !== null && data.repos.includes(data.repo) ? data.repo : '',
	);
	const noMatch = $derived(data.repo !== null && total === 0);
	const description = $derived(
		noMatch
			? 'No open milestones match this repository.'
			: data.timeline.window === null
				? 'No open milestone has a due date, so nothing can be placed on the chart. Add a due date on GitHub to see it here.'
				: 'Bars run from the first planned week or observed transition to the due date. The fill is closed work; the ticks are open child issues.',
	);
	const emptyTitle = $derived(
		noMatch ? 'No milestones in this repository.' : 'Nothing to plot yet.',
	);
	const emptyDescription = $derived(
		noMatch
			? 'Choose another repository or view all milestones.'
			: 'Open a milestone with a due date, or attach work to one, to see it here.',
	);

	function onRepoChange(event: Event): void {
		const repo = (event.currentTarget as HTMLSelectElement).value;
		void goto(repo ? `/timeline?repo=${encodeURIComponent(repo)}` : '/timeline', {
			reset: false,
		});
	}
</script>

<PageHead
	title="Timeline"
	description="Open milestones projected from planned weeks and observed status changes to their due dates."
/>

<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
	<PageHeader
		title="Timeline"
		count={`${total} open`}
		{description}
	>
		{#snippet actions()}
			<Button variant="outline" href="/milestones">
				<FlagIcon aria-hidden="true" />
				Milestones
			</Button>
		{/snippet}
	</PageHeader>

	<Toolbar>
		<label class="flex flex-col gap-1">
			<span class="text-caption text-fg-secondary">Repository</span>
			<select
				class="bg-canvas text-body text-fg h-(--size-control-md) rounded-sm border border-border-strong px-2"
				aria-label="Filter by repository"
				value={selectedRepo}
				onchange={onRepoChange}
			>
				<option value="">All repositories</option>
				{#each data.repos as repo (repo)}
					<option value={repo}>{repo}</option>
				{/each}
			</select>
		</label>
	</Toolbar>

	<div class="px-[var(--layout-page-padding)] pt-6 pb-8">
		<TimelineChart
			rows={data.timeline.rows}
			window={data.timeline.window}
			now={data.timeline.now}
			undated={data.timeline.undated}
			repoShortcodes={data.repoShortcodes}
			{emptyTitle}
			{emptyDescription}
		/>
	</div>
</div>
