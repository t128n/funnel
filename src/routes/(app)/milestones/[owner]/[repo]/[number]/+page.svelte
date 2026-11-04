<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import ProgressBar from '#lib/components/epics/ProgressBar.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { isMilestoneOverdue, milestoneDueLabel } from '#lib/milestone-format';
	import { projectIssues } from '#lib/client/optimistic.svelte';
	import { barPercent } from '#lib/planning';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const issues = $derived(projectIssues(data.issues));
	const totalIssues = $derived(data.milestone.closedIssues + data.milestone.openIssues);
	const now = Date.now();

	function dueLabel(dueOn: number | null): string {
		return milestoneDueLabel(dueOn) ?? 'No due date';
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

<main class="container-xl py-4">
	<PageHeader
		title={data.milestone.title || 'Untitled milestone'}
		description={data.milestone.description || undefined}
		actions={backLink}
	/>

	<div class="d-flex flex-wrap align-items-baseline column-gap-3 row-gap-1 pb-3 small text-body-secondary">
		<span>{data.milestone.repo}#{data.milestone.number}</span>
		{#if isMilestoneOverdue(data.milestone, now)}
			<span class="text-danger text-nowrap">
				<i class="bi bi-exclamation-circle me-1" aria-hidden="true"></i>
				Overdue · {dueLabel(data.milestone.dueOn)}
			</span>
		{:else}
			<span>{data.milestone.dueOn === null ? 'No due date' : `Due ${dueLabel(data.milestone.dueOn)}`}</span>
		{/if}
		{#if data.milestone.state === 'closed'}
			<StatusText state="closed" />
		{:else}
			<StatusText status="open" />
		{/if}
		<span class="d-inline-flex align-items-center gap-2">
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
</main>
