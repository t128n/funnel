<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import ProgressBar from '#lib/components/epics/ProgressBar.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { projectIssues } from '#lib/client/optimistic.svelte';
	import { barPercent } from '#lib/planning';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const issues = $derived(projectIssues(data.issues));
	const totalIssues = $derived(data.milestone.closedIssues + data.milestone.openIssues);

	function dueLabel(dueOn: number | null): string {
		return dueOn === null ? 'No due date' : new Date(dueOn).toISOString().slice(0, 10);
	}
</script>

{#snippet backLink()}
	<Button color="link" size="sm" href="/milestones" class="text-decoration-none">
		<i class="bi bi-arrow-left me-1" aria-hidden="true"></i>
		Milestones
	</Button>
{/snippet}

<PageHead
	title={data.milestone.title || 'Milestone'}
	description={data.milestone.description || undefined}
/>

<div class="d-flex min-h-0 flex-grow-1 flex-column">
	<PageHeader
		title={data.milestone.title || 'Untitled milestone'}
		description={data.milestone.description || undefined}
		actions={backLink}
	/>

	<div
		class="d-flex flex-wrap align-items-center column-gap-3 row-gap-1 px-3 pb-3 text-body-secondary"
	>
		<span class="font-monospace text-body-secondary">
			{data.milestone.repo}#{data.milestone.number}
		</span>
		<span class="num">
			{data.milestone.dueOn === null ? 'No due date' : `Due ${dueLabel(data.milestone.dueOn)}`}
		</span>
		{#if data.milestone.state === 'closed'}
			<StatusText state="closed" />
		{:else}
			<StatusText status="open" />
		{/if}
		<span class="d-flex align-items-center gap-2 num">
			<span>{data.milestone.closedIssues} / {totalIssues} closed</span>
			<ProgressBar value={barPercent(data.milestone.closedIssues, totalIssues)} />
		</span>
	</div>

	<IssueList
		{issues}
		empty="No issues are attached to this milestone."
		repoShortcodes={data.repoShortcodes}
		groupable={false}
	/>
</div>

<style>
	.num {
		font-variant-numeric: tabular-nums;
	}
</style>
