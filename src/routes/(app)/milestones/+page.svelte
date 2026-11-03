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

<main class="container-xl py-4">
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
			class="border-top border-bottom py-5"
		/>
	{:else}
		<div class="d-flex flex-column gap-4">
			{#each data.groups as group (group.repo)}
				<section class="d-flex flex-column">
					<h2 class="small text-body-secondary fw-normal mb-2">{group.repo}</h2>
					<div class="table-responsive border rounded">
						<Table hover size="sm" class="align-middle funnel-table mb-0">
							<thead class="bg-body-tertiary small text-body-secondary">
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
									class={milestone.state === 'closed' ? 'text-body-tertiary' : ''}
								>
									<td class="min-w-0">
										<a
											href={href(milestone)}
											class="link-primary link-underline-opacity-0 link-underline-opacity-100-hover"
										>
											{milestone.title || 'Untitled milestone'}
										</a>
										{#if milestone.state === 'closed'}
											<StatusText state="closed" class="ms-2" />
										{/if}
									</td>
									<td class="text-end text-nowrap">
										{dueLabel(milestone.dueOn)}
									</td>
									<td class="text-end text-nowrap">
										<span class="d-inline-flex align-items-center justify-content-end gap-2">
											<span class="small text-body-secondary">
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
					</div>
				</section>
			{/each}
		</div>
	{/if}
</main>
