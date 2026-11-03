<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '@sveltestrap/sveltestrap';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import TimelineChart from '#lib/components/timeline/TimelineChart.svelte';
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

<div class="d-flex min-h-0 flex-grow-1 flex-column overflow-y-auto">
	<PageHeader
		title="Timeline"
		count={`${total} open`}
		{description}
	>
		{#snippet actions()}
			<Button color="outline-secondary" href="/milestones">
				<i class="bi bi-flag me-1" aria-hidden="true"></i>
				Milestones
			</Button>
		{/snippet}
	</PageHeader>

	<Toolbar>
		<label class="d-flex flex-column gap-1">
			<span class="small text-body-secondary">Repository</span>
			<select
				class="form-select form-select-sm w-auto"
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

	<div class="px-3 py-3">
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
