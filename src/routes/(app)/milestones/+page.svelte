<script lang="ts">
	import ChartGanttIcon from '@lucide/svelte/icons/chart-gantt';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button } from '#lib/components/ui/button';
	import { barPercent } from '#lib/planning';
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

<PageHead title="Milestones" />

<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
	<PageHeader title="Milestones">
		{#snippet actions()}
			<Button variant="outline" href="/timeline">
				<ChartGanttIcon aria-hidden="true" />
				Timeline
			</Button>
		{/snippet}
	</PageHeader>

	{#if data.groups.length === 0}
		<EmptyState
			title="No milestones yet."
			description="Create one from an issue, or on GitHub."
			class="flex-1"
		/>
	{:else}
		<div class="flex flex-col gap-6 px-[var(--layout-page-padding)] pb-8">
			{#each data.groups as group (group.repo)}
				<section class="flex flex-col gap-2">
					<h2 class="text-body font-semibold text-fg">{group.repo}</h2>
					<div class="overflow-x-auto">
						<table class="data-table">
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
									<tr
										class={milestone.state === 'closed'
											? 'relative text-fg-muted'
											: 'relative'}
									>
										<td class="min-w-0">
											<a
												href={href(milestone)}
												class="flex min-w-0 items-center gap-2 after:absolute after:inset-0 after:content-['']"
											>
												<span class="min-w-0 truncate text-body">
													{milestone.title || 'Untitled milestone'}
												</span>
												{#if milestone.state === 'closed'}
													<StatusText state="closed" class="shrink-0" />
												{/if}
											</a>
										</td>
										<td class="tabular-nums text-end whitespace-nowrap">
											{dueLabel(milestone.dueOn)}
										</td>
										<td class="whitespace-nowrap">
											<span class="flex items-center justify-end gap-2">
												<span class="tabular-nums text-body">
													{milestone.closedIssues} / {milestone.closedIssues +
														milestone.openIssues}
												</span>
												<span
													class="inline-flex h-(--size-capacity-bar) w-10 shrink-0 overflow-hidden rounded-full bg-surface-2"
													aria-hidden="true"
												>
													<span
														class="block h-full bg-primary"
														style={`width: ${barPercent(
															milestone.closedIssues,
															milestone.closedIssues + milestone.openIssues
														)}%`}
													></span>
												</span>
											</span>
										</td>
										<td class="text-body text-fg-secondary">
											{milestone.creator?.login ?? '—'}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>
