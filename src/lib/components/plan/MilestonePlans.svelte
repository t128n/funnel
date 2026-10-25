<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import * as Empty from '#lib/components/ui/empty';
	import type { MilestonePlan } from '#lib/server/planning/milestones';
	import { issuePath } from '#lib/issue-url';
	import { formatMinutes } from '#lib/planning';
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
	}

	let { plans, allocationPercent = 60 }: Props = $props();

	function issueKey(repo: string, number: number): string {
		return `${repo}#${number}`;
	}
</script>

{#if plans.length === 0}
	<Empty.Root class="border-0 py-8">
		<Empty.Description>No open milestones with open issues.</Empty.Description>
	</Empty.Root>
{:else}
	<div class="flex flex-col gap-4" data-testid="milestone-plans">
		{#each plans as plan (`${plan.repo}#${plan.number}`)}
			<section
				class="border-[color:var(--border)] flex flex-col gap-2 rounded border p-3"
				data-milestone={`${plan.repo}#${plan.number}`}
			>
				<header class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
					<span class="min-w-0 truncate text-sm font-medium">
						{plan.title || 'Untitled milestone'}
					</span>
					<span class="text-muted-foreground shrink-0 text-[11px] tabular-nums">
						{plan.repo}#{plan.number}
					</span>
					<span class="text-muted-foreground ms-auto shrink-0 text-[11px] tabular-nums">
						Due {dueLabel(plan.dueOn)}
					</span>
					<span class="text-muted-foreground shrink-0 text-[11px]">
						{weeksLabel(plan.capacityWeeks)}
					</span>
				</header>

				{#if plan.capacityWeeks === null}
					<p class="text-muted-foreground text-[11px]">
						No due date, so no cap — committed hours are shown without a bar.
					</p>
				{/if}

				{#each plan.lanes as lane (lane.maintainer.externalId)}
					<div class="flex min-w-0 items-center gap-2" data-lane={lane.maintainer.login}>
						<Avatar
							login={lane.maintainer.login}
							avatarUrl={lane.maintainer.avatarUrl}
							size={18}
						/>
						<a
							class="focus-visible:ring-ring/50 min-w-0 truncate rounded text-xs outline-none hover:underline focus-visible:ring-2"
							href={`https://github.com/${lane.maintainer.login}`}
							target="_blank"
							rel="noreferrer"
						>
							@{lane.maintainer.login}
						</a>
						<CapacityBar
							class="ms-auto w-full max-w-64"
							committedMinutes={lane.committedMinutes}
							capMinutes={milestoneCap(plan.capacityWeeks, lane.capMinutes)}
							{allocationPercent}
						/>
						{#if lane.over}
							<span class="text-destructive shrink-0 text-[11px] font-medium">over</span>
						{/if}
					</div>
					{#if lane.issues.length > 0}
						<ul class="flex flex-col gap-0.5 ps-7">
							{#each lane.issues as issue (issueKey(issue.repo, issue.number))}
								<li class="flex min-w-0 items-center gap-2">
									<a
										class="focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded text-[11px] outline-none hover:underline focus-visible:ring-2"
										href={issuePath('issues', issue.repo, issue.number)}
									>
										<span class="text-muted-foreground me-1.5 tabular-nums">
											{issue.repo}#{issue.number}
										</span>
										{issue.title}
									</a>
									<span class="text-muted-foreground shrink-0 text-[10px]">
										{issue.size?.toUpperCase() ?? '—'}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				{/each}

				{#if plan.unassigned.committedMinutes > 0}
					<div class="flex min-w-0 items-center gap-2 text-[11px]" data-testid="milestone-unassigned">
						<span class="font-medium">Unassigned</span>
						<span class="text-muted-foreground tabular-nums">
							{formatMinutes(plan.unassigned.committedMinutes)} committed · no active maintainer
						</span>
					</div>
				{/if}

				{#if plan.unestimated.length > 0}
					<div class="flex flex-wrap items-center gap-1.5 text-[11px]">
						<span class="font-medium">Unestimated</span>
						<span class="text-muted-foreground">{plan.unestimated.length}</span>
						{#each plan.unestimated as issue (issueKey(issue.repo, issue.number))}
							<a
								class="text-muted-foreground focus-visible:ring-ring/50 max-w-56 truncate rounded underline-offset-2 outline-none hover:underline focus-visible:ring-2"
								href={issuePath('issues', issue.repo, issue.number)}
							>
								{issue.repo}#{issue.number}
							</a>
						{/each}
					</div>
				{/if}
			</section>
		{/each}
	</div>
{/if}
