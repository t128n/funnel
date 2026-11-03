<script lang="ts">
	import { Button, Table } from '@sveltestrap/sveltestrap';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import ProgressBar from '#lib/components/epics/ProgressBar.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
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

<div class="d-flex min-h-0 flex-grow-1 flex-column overflow-y-auto">
	<PageHeader title="Milestones">
		{#snippet actions()}
			<Button color="outline-secondary" href="/timeline">
				<i class="bi bi-bar-chart-steps me-1" aria-hidden="true"></i>
				Timeline
			</Button>
		{/snippet}
	</PageHeader>

	{#if data.groups.length === 0}
		<EmptyState
			title="No milestones yet."
			description="Create one from an issue, or on GitHub."
			class="flex-grow-1"
		/>
	{:else}
		<div class="d-flex flex-column gap-4 px-3 pb-4">
			{#each data.groups as group (group.repo)}
				<section class="d-flex flex-column gap-2">
					<h2 class="h6 fw-semibold text-body mb-0">{group.repo}</h2>
					<Table hover responsive size="sm" class="align-middle funnel-table">
						<thead>
							<tr>
								<th scope="col">Milestone</th>
								<th scope="col" class="text-end">Due</th>
								<th scope="col" class="text-end">Progress</th>
								<th scope="col">Created by</th>
							</tr>
						</thead>
						<tbody>
							{#each group.milestones as milestone (milestone.number)}
								<tr
									class="position-relative {milestone.state === 'closed'
										? 'text-body-tertiary'
										: ''}"
								>
									<td class="min-w-0">
										<a
											href={href(milestone)}
											class="d-flex min-w-0 align-items-center gap-2 stretched-link text-decoration-none"
										>
											<span class="min-w-0 text-truncate text-body">
												{milestone.title || 'Untitled milestone'}
											</span>
											{#if milestone.state === 'closed'}
												<StatusText state="closed" class="flex-shrink-0" />
											{/if}
										</a>
									</td>
									<td class="num text-end text-nowrap">
										{dueLabel(milestone.dueOn)}
									</td>
									<td class="text-nowrap">
										<span class="d-flex align-items-center justify-content-end gap-2">
											<span class="num text-body">
												{milestone.closedIssues} / {milestone.closedIssues +
													milestone.openIssues}
											</span>
											<ProgressBar
												value={barPercent(
													milestone.closedIssues,
													milestone.closedIssues + milestone.openIssues
												)}
											/>
										</span>
									</td>
									<td class="text-body-secondary">
										{milestone.creator?.login ?? '—'}
									</td>
								</tr>
							{/each}
						</tbody>
					</Table>
				</section>
			{/each}
		</div>
	{/if}
</div>

<style>
	.num {
		font-variant-numeric: tabular-nums;
	}
</style>
