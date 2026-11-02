<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import ProgressBar from '#lib/components/epics/ProgressBar.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button } from '#lib/components/ui/button';
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
	<Button variant="ghost" size="sm" href="/milestones">
		<ArrowLeftIcon />
		Milestones
	</Button>
{/snippet}

<PageHead
	title={data.milestone.title || 'Milestone'}
	description={data.milestone.description || undefined}
/>

<div class="flex min-h-0 flex-1 flex-col">
	<PageHeader
		title={data.milestone.title || 'Untitled milestone'}
		description={data.milestone.description || undefined}
		actions={backLink}
	/>

	<div
		class="flex flex-wrap items-center gap-x-3 gap-y-1 px-[var(--layout-page-padding)] pb-4 text-body text-fg-secondary"
	>
		<span class="mono text-fg-secondary">
			{data.milestone.repo}#{data.milestone.number}
		</span>
		<span class="tabular-nums">
			{data.milestone.dueOn === null ? 'No due date' : `Due ${dueLabel(data.milestone.dueOn)}`}
		</span>
		{#if data.milestone.state === 'closed'}
			<StatusText state="closed" />
		{:else}
			<span class="status status-muted">
				<CircleIcon aria-hidden="true" />
				<span>Open</span>
			</span>
		{/if}
		<span class="flex items-center gap-2 tabular-nums">
			<span>{data.milestone.closedIssues} / {totalIssues} closed</span>
			<ProgressBar
				value={barPercent(data.milestone.closedIssues, totalIssues)}
				class="w-10"
			/>
		</span>
	</div>

	<IssueList
		{issues}
		empty="No issues are attached to this milestone."
		repoShortcodes={data.repoShortcodes}
		groupable={false}
	/>
</div>
