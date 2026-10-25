<script lang="ts">
	import PageHead from '#lib/components/common/PageHead.svelte';
	import IssueList from '#lib/components/issue/IssueList.svelte';
	import { projectIssues } from '#lib/client/optimistic.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const issues = $derived(projectIssues(data.issues));

	function dueLabel(dueOn: number | null): string {
		return dueOn === null ? 'No due date' : new Date(dueOn).toISOString().slice(0, 10);
	}
</script>

<PageHead
	title={data.milestone.title || 'Milestone'}
	description={data.milestone.description || undefined}
/>

<div class="surface-shell bg-[var(--background)] flex min-h-0 flex-1 flex-col">
	<header class="border-[color:var(--border)] flex flex-col gap-2 border-b px-3 py-2">
		<div class="flex min-w-0 items-center gap-2">
			<a
				href="/milestones"
				class="text-muted-foreground hover:text-foreground shrink-0 text-xs"
			>
				← Milestones
			</a>
			<h1 class="min-w-0 truncate text-base font-semibold tracking-tight">
				{data.milestone.title || 'Untitled milestone'}
			</h1>
			<span class="text-muted-foreground shrink-0 text-[11px]">
				{data.milestone.repo}#{data.milestone.number}
			</span>
		</div>
		<div class="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
			<span class="tabular-nums">Due {dueLabel(data.milestone.dueOn)}</span>
			<span class="tabular-nums">
				{data.milestone.closedIssues}/{data.milestone.closedIssues + data.milestone.openIssues} closed
			</span>
			{#if data.milestone.state === 'closed'}
				<span>Closed</span>
			{/if}
		</div>
		{#if data.milestone.description}
			<p class="text-muted-foreground max-w-3xl text-xs leading-relaxed">
				{data.milestone.description}
			</p>
		{/if}
	</header>

	<IssueList
		{issues}
		empty="No issues are attached to this milestone."
		repoShortcodes={data.repoShortcodes}
		groupable={false}
	/>
</div>
