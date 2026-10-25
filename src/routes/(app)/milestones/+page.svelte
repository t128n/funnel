<script lang="ts">
	import PageHead from '#lib/components/common/PageHead.svelte';
	import * as Empty from '#lib/components/ui/empty';
	import type { MilestoneItem } from '#lib/server/issues/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function href(milestone: MilestoneItem): string {
		const slash = milestone.repo.indexOf('/');
		const owner = slash > 0 ? milestone.repo.slice(0, slash) : milestone.repo;
		const name = slash > 0 ? milestone.repo.slice(slash + 1) : '';
		return `/milestones/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${milestone.number}`;
	}

	function dueLabel(dueOn: number | null): string {
		if (dueOn === null) return 'No due date';
		return new Date(dueOn).toISOString().slice(0, 10);
	}
</script>

<PageHead
	title="Milestones"
	description="GitHub milestones across the configured repositories, with progress and due dates."
/>

<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
	<header class="bug-chrome flex min-h-11 shrink-0 items-center gap-2 px-3">
		<h1 class="text-base font-semibold tracking-tight">Milestones</h1>
	</header>

	{#if data.groups.length === 0}
		<Empty.Root class="flex-1 border-0">
			<Empty.Description>
				No milestones yet. Create one from an issue, or on GitHub.
			</Empty.Description>
		</Empty.Root>
	{:else}
		<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
			{#each data.groups as group (group.repo)}
				<section class="flex flex-col gap-2">
					<h2 class="text-muted-foreground text-xs font-semibold tracking-[0.04em] uppercase">
						{group.repo}
					</h2>
					<table class="bug-table border border-border">
						<thead>
							<tr>
								<th>Milestone</th>
								<th class="text-end">Due</th>
								<th class="text-end">Progress</th>
								<th>Created by</th>
							</tr>
						</thead>
						<tbody>
							{#each group.milestones as milestone (milestone.number)}
								<tr class={milestone.state === 'closed' ? 'text-muted-foreground' : ''}>
									<td class="min-w-0">
										<a
											href={href(milestone)}
											class={milestone.state === 'closed' ? 'line-through' : 'link'}
										>
											{milestone.title || 'Untitled milestone'}
										</a>
										{#if milestone.state === 'closed'}
											<span class="flag flag-muted ms-2">closed</span>
										{/if}
									</td>
									<td class="mono text-end whitespace-nowrap">{dueLabel(milestone.dueOn)}</td>
									<td class="mono text-end whitespace-nowrap">
										{milestone.closedIssues}/{milestone.closedIssues + milestone.openIssues}
									</td>
									<td class="text-muted-foreground text-xs">
										{milestone.creator?.login ?? ''}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</section>
			{/each}
		</div>
	{/if}
</div>

<style>
	.bug-table thead th.text-end {
		text-align: right;
	}

	.bug-table tbody tr:hover {
		background: var(--accent);
	}
</style>
