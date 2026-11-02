<script lang="ts">
	import CircleIcon from '@lucide/svelte/icons/circle';
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
	 * has no capacity window: it shows committed hours (and can never be over)
	 * but renders no cap bar.
	 */
	interface Props {
		plans: MilestonePlan[];
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
		class="border-y border-border-subtle py-10"
	/>
{:else}
	<div class="overflow-x-auto" data-testid="milestone-plans">
		<table class="data-table">
			<thead>
				<tr>
					<th scope="col">Milestone</th>
					<th scope="col">State</th>
					<th scope="col" class="text-end">Due</th>
					<th scope="col" class="text-end">Open issues</th>
					<th scope="col">Committed / cap</th>
				</tr>
			</thead>
			<tbody>
				{#each plans as plan (`${plan.repo}#${plan.number}`)}
					{@const totals = laneTotals(plan)}
					<tr data-milestone={`${plan.repo}#${plan.number}`}>
						<th scope="row" class="min-w-0">
							<span class="block truncate text-body font-semibold text-fg">
								{plan.title || 'Untitled milestone'}
							</span>
							<span class="mono block text-caption text-fg-secondary">
								{plan.repo}#{plan.number}
							</span>
						</th>
						<td>
							<span class="status status-muted">
								<CircleIcon aria-hidden="true" />
								<span>Open</span>
							</span>
						</td>
						<td class="text-end tabular-nums">{dueLabel(plan.dueOn)}</td>
						<td class="text-end tabular-nums">{totals.open} open</td>
						<td>
							<CapacityBar
								committedMinutes={totals.committed}
								capMinutes={milestoneCap(plan.capacityWeeks, totals.cap)}
								{allocationPercent}
							/>
						</td>
					</tr>
					<tr>
						<td colspan="5" class="bg-canvas px-3 py-3 align-top">
							<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
								<span class="text-caption text-fg-secondary">
									{weeksLabel(plan.capacityWeeks)} of capacity
								</span>
								{#if plan.capacityWeeks === null}
									<span class="text-caption text-fg-secondary">
										No due date, so no cap — committed hours are shown without a bar.
									</span>
								{/if}
							</div>

							<div class="mt-2 grid gap-x-6 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
								{#each plan.lanes as lane (lane.maintainer.externalId)}
									<div class="min-w-0 border-t border-border-subtle py-2" data-lane={lane.maintainer.login}>
										<div class="flex min-w-0 items-center gap-2">
											<Avatar
												login={lane.maintainer.login}
												avatarUrl={lane.maintainer.avatarUrl}
												size={20}
											/>
											<a
												class="min-w-0 truncate text-body font-semibold text-fg hover:underline"
												href={`https://github.com/${lane.maintainer.login}`}
												target="_blank"
												rel="noreferrer"
											>
												@{lane.maintainer.login}
											</a>
											<CapacityBar
												class="ms-auto w-full max-w-56"
												committedMinutes={lane.committedMinutes}
												capMinutes={milestoneCap(plan.capacityWeeks, lane.capMinutes)}
												{allocationPercent}
											/>
										</div>
										{#if lane.issues.length > 0}
											<ul class="mt-1 flex flex-col ps-6">
												{#each lane.issues as issue (issueKey(issue.repo, issue.number))}
													<li class="flex min-w-0 items-baseline gap-2 text-caption">
														<a
															class="mono shrink-0 text-fg-secondary hover:underline"
															href={issuePath('issues', issue.repo, issue.number)}
														>
															{issue.repo}#{issue.number}
														</a>
														<span class="min-w-0 flex-1 truncate text-fg">{issue.title}</span>
														<span class="shrink-0 text-fg-secondary">
															{issue.size?.toUpperCase() ?? '—'}
														</span>
														<span class="w-10 shrink-0 text-end text-fg-secondary tabular-nums">
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
									class="mt-2 flex flex-wrap items-baseline gap-x-2 border-t border-border-subtle pt-2 text-caption"
									data-testid="milestone-unassigned"
								>
									<span class="font-semibold text-fg">Unassigned</span>
									<span class="text-fg-secondary tabular-nums">
										{formatMinutes(plan.unassigned.committedMinutes)} committed · no active
										maintainer
									</span>
								</div>
							{/if}

							{#if plan.unestimated.length > 0}
								<div class="mt-2 flex flex-wrap items-baseline gap-x-2 border-t border-border-subtle pt-2 text-caption">
									<span class="font-semibold text-fg">Unestimated</span>
									<span class="text-fg-secondary tabular-nums">{plan.unestimated.length}</span>
									{#each plan.unestimated as issue (issueKey(issue.repo, issue.number))}
										<a
											class="mono max-w-56 truncate text-fg-secondary hover:underline"
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
		</table>
	</div>
{/if}
