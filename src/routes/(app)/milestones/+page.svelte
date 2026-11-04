<script lang="ts">
	import { Button, Table } from '@sveltestrap/sveltestrap';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import Breadcrumbs from '#lib/components/shell/Breadcrumbs.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import ProgressBar from '#lib/components/epics/ProgressBar.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import {
		isMilestoneOverdue,
		milestoneDueLabel
	} from '#lib/milestone-format';
	import { barPercent } from '#lib/planning';
	import type { MilestoneItem } from '#lib/server/issues/types';
	import type { PageProps } from './$types';

	/**
	 * Milestones grouped by repository. Below `md` the table keeps the title and
	 * folds due date, progress and creator into a metadata line; the due date
	 * carries the same Overdue word and icon as the Timeline when the milestone
	 * still has open work.
	 */
	let { data }: PageProps = $props();

	const now = Date.now();

	function href(milestone: MilestoneItem): string {
		const slash = milestone.repo.indexOf('/');
		const owner = slash > 0 ? milestone.repo.slice(0, slash) : milestone.repo;
		const name = slash > 0 ? milestone.repo.slice(slash + 1) : '';
		return `/milestones/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${milestone.number}`;
	}

	function total(milestone: MilestoneItem): number {
		return milestone.closedIssues + milestone.openIssues;
	}

	function dueText(milestone: MilestoneItem): string {
		return milestoneDueLabel(milestone.dueOn) ?? 'No due date';
	}
</script>

{#snippet dueDate(milestone: MilestoneItem)}
	{#if isMilestoneOverdue(milestone, now)}
		<span class="text-danger text-nowrap">
			<i class="bi bi-exclamation-circle me-1" aria-hidden="true"></i>
			Overdue · {milestoneDueLabel(milestone.dueOn)}
		</span>
	{:else}
		<span class="text-nowrap">{dueText(milestone)}</span>
	{/if}
{/snippet}

{#snippet progress(milestone: MilestoneItem)}
	<span class="d-inline-flex align-items-center justify-content-end gap-2">
		<span class="small text-body-secondary">
			{milestone.closedIssues} / {total(milestone)}
		</span>
		<ProgressBar value={barPercent(milestone.closedIssues, total(milestone))} />
	</span>
{/snippet}

<PageHead title="Milestones" />

<main class="container-xl py-4">
	<Breadcrumbs items={[{ label: 'Workspace', href: '/issues' }, { label: 'Milestones' }]} />

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
						<Table hover size="sm" class="align-middle funnel-table funnel-table--fluid mb-0">
							<thead class="table-light small text-body-secondary">
								<tr>
									<th scope="col" class="text-body-secondary">Milestone</th>
									<th scope="col" class="text-body-secondary text-end d-none d-md-table-cell" style="width: 11rem;">
										Due
									</th>
									<th scope="col" class="text-body-secondary text-end d-none d-md-table-cell" style="width: 9rem;">
										Progress
									</th>
									<th scope="col" class="text-body-secondary d-none d-lg-table-cell" style="width: 9rem;">
										Created by
									</th>
								</tr>
							</thead>
							<tbody>
								{#each group.milestones as milestone (milestone.number)}
									<tr class={milestone.state === 'closed' ? 'text-body-tertiary' : ''}>
										<td class="min-w-0">
											<div class="d-flex flex-wrap align-items-baseline gap-2">
												<a
													href={href(milestone)}
													class="text-primary text-decoration-none text-break"
												>
													{milestone.title || 'Untitled milestone'}
												</a>
												{#if milestone.state === 'closed'}
													<StatusText state="closed" />
												{/if}
											</div>
											<div class="small text-body-secondary d-md-none mt-1 text-break">
												{@render dueDate(milestone)}
												<span class="mx-1" aria-hidden="true">·</span>
												{@render progress(milestone)}
												{#if milestone.creator}
													<span class="mx-1" aria-hidden="true">·</span>
													<span>{milestone.creator.login}</span>
												{/if}
											</div>
										</td>
										<td class="text-end d-none d-md-table-cell">
											{@render dueDate(milestone)}
										</td>
										<td class="text-end d-none d-md-table-cell">
											{@render progress(milestone)}
										</td>
										<td class="text-body-secondary d-none d-lg-table-cell">
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
