<script lang="ts">
	import { Table } from '@sveltestrap/sveltestrap';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import type { MilestonePlan } from '#lib/server/planning/milestones';
	import { issuePath } from '#lib/issue-url';
	import { formatMinutes } from '#lib/planning';
	import type { PlanningIssue } from '#lib/server/planning/queries';
	import CapacityBar from './CapacityBar.svelte';
	import { dueLabel, milestoneCap, weeksLabel } from './format';

	/**
	 * Read-only capacity for open milestones. A milestone without a due date
	 * has no capacity window: it shows scheduled hours (and can never be over)
	 * but renders no cap bar. Every cap already includes the configured
	 * allocation, so the bars carry no allocation marker.
	 */
	interface Props {
		plans: MilestonePlan[];
		/** Instance allocation percentage; the cap already includes it. */
		allocationPercent?: number;
		/** Size label → minutes, supplied by the server's planning settings. */
		sizeMinutes?: Record<string, number>;
	}

	let { plans, allocationPercent = 60, sizeMinutes = {} }: Props = $props();

	function issueKey(repo: string, number: number): string {
		return `${repo}#${number}`;
	}

	function laneTotals(plan: MilestonePlan): { committed: number; cap: number; open: number } {
		return plan.lanes.reduce(
			(total, lane) => ({
				committed: total.committed + lane.committedMinutes,
				cap: total.cap + lane.capMinutes,
				open: total.open + lane.issues.length
			}),
			{ committed: 0, cap: 0, open: 0 }
		);
	}

	function estimateLabel(issue: PlanningIssue): string {
		if (issue.size === null) return '—';
		const minutes = sizeMinutes[issue.size] ?? sizeMinutes[issue.size.toLowerCase()];
		return minutes === undefined ? '—' : formatMinutes(minutes);
	}
</script>

{#if plans.length === 0}
	<EmptyState
		title="No milestones with open issues."
		description="Open milestones that contain open issues appear here with their capacity."
		class="border-top border-bottom py-5"
	/>
{:else}
	<div class="overflow-x-auto" data-testid="milestone-plans">
		<Table hover class="funnel-table table-sm align-middle">
			<thead>
				<tr>
					<th scope="col">Milestone</th>
					<th scope="col">State</th>
					<th scope="col" class="text-end">Due</th>
					<th scope="col" class="text-end">Open Issues</th>
					<th scope="col">Scheduled / Cap</th>
				</tr>
			</thead>
			<tbody>
				{#each plans as plan (`${plan.repo}#${plan.number}`)}
					{@const totals = laneTotals(plan)}
					<tr data-milestone={`${plan.repo}#${plan.number}`}>
						<th scope="row" class="min-w-0">
							<span class="d-block text-truncate text-body">
								{plan.title || 'Untitled milestone'}
							</span>
							<span class="font-monospace d-block small text-body-secondary">
								{plan.repo}#{plan.number}
							</span>
						</th>
						<td>
							<span class="d-inline-flex align-items-center gap-1 small text-body-secondary">
								<i class="bi bi-circle" aria-hidden="true"></i>
								<span>Open</span>
							</span>
						</td>
						<td class="text-end tnum">{dueLabel(plan.dueOn)}</td>
						<td class="text-end tnum">{totals.open} open</td>
						<td class="milestone-capacity">
							<CapacityBar
								committedMinutes={totals.committed}
								capMinutes={milestoneCap(plan.capacityWeeks, totals.cap)}
							/>
						</td>
					</tr>
					<tr>
						<td colspan="5" class="py-2 align-top">
							<p class="small text-body-secondary mb-0">
								{#if plan.capacityWeeks === null}
									No due date — no cap; scheduled hours are shown without a bar.
								{:else}
									Capacity window: {weeksLabel(plan.capacityWeeks)} · cap includes
									{allocationPercent}% of net.
								{/if}
							</p>

							<div class="row g-3 mt-1">
								{#each plan.lanes as lane (lane.maintainer.externalId)}
									<div
										class="col-md-6 col-xl-4 min-w-0 border-top pt-2"
										data-lane={lane.maintainer.login}
									>
										<div class="d-flex min-w-0 align-items-center gap-2">
											<Avatar
												login={lane.maintainer.login}
												avatarUrl={lane.maintainer.avatarUrl}
												size={20}
											/>
											<a
												class="min-w-0 text-truncate text-decoration-none text-body fw-medium"
												href={`https://github.com/${lane.maintainer.login}`}
												target="_blank"
												rel="noreferrer"
											>
												@{lane.maintainer.login}
											</a>
											<span class="ms-auto flex-shrink-0 small text-body-secondary tnum">
												Net {formatMinutes(lane.maintainer.weeklyMinutes)}/week
											</span>
										</div>
										<CapacityBar
											class="mt-1 w-100"
											committedMinutes={lane.committedMinutes}
											capMinutes={milestoneCap(plan.capacityWeeks, lane.capMinutes)}
										/>
										{#if lane.issues.length > 0}
											<ul class="mt-1 d-flex flex-column ps-4 mb-0 list-unstyled">
												{#each lane.issues as issue (issueKey(issue.repo, issue.number))}
													<li class="d-flex min-w-0 align-items-baseline gap-2 small">
														<a
															class="font-monospace flex-shrink-0 text-decoration-none text-body-secondary"
															href={issuePath('issues', issue.repo, issue.number)}
														>
															{issue.repo}#{issue.number}
														</a>
														<span class="min-w-0 flex-grow-1 text-truncate text-body">
															{issue.title}
														</span>
														<span class="flex-shrink-0 text-end text-body-secondary" style="width: 1.5rem">
															{issue.size?.toUpperCase() ?? '—'}
														</span>
														<span
															class="flex-shrink-0 text-end text-body-secondary tnum"
															style="width: 3rem"
														>
															{estimateLabel(issue)}
														</span>
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								{/each}
							</div>

							{#if plan.unassigned.committedMinutes > 0}
								<div
									class="mt-2 d-flex flex-wrap align-items-baseline gap-2 border-top pt-2 small"
									data-testid="milestone-unassigned"
								>
									<span class="fw-semibold text-body">Unassigned</span>
									<span class="text-body-secondary tnum">
										Scheduled {formatMinutes(plan.unassigned.committedMinutes)} · no active
										maintainer
									</span>
								</div>
							{/if}

							{#if plan.unestimated.length > 0}
								<div
									class="mt-2 d-flex flex-wrap align-items-baseline gap-2 border-top pt-2 small"
								>
									<span class="fw-semibold text-body">Unestimated</span>
									<span class="text-body-secondary tnum">
										{plan.unestimated.length}
										{plan.unestimated.length === 1 ? 'issue' : 'issues'}
									</span>
									{#each plan.unestimated as issue (issueKey(issue.repo, issue.number))}
										<a
											class="font-monospace text-truncate text-decoration-none text-body-secondary unestimated-ref"
											href={issuePath('issues', issue.repo, issue.number)}
										>
											{issue.repo}#{issue.number}
										</a>
									{/each}
								</div>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</Table>
	</div>
{/if}

<style>
	.milestone-capacity {
		min-width: 14rem;
	}

	.unestimated-ref {
		max-width: 14rem;
	}

	.tnum {
		font-variant-numeric: tabular-nums;
	}
</style>
