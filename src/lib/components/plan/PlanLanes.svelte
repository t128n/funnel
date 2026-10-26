<script lang="ts">
	import * as Empty from '#lib/components/primitives/empty';
	import type { PlanningIssue } from '#lib/server/planning/queries';
	import type { PlanLane, PlanUnassigned } from '#lib/server/planning/plans';
	import { issuePath } from '#lib/issue-url';
	import { formatMinutes } from '#lib/planning';
	import CapacityBar from './CapacityBar.svelte';

	/**
	 * Maintainer lanes for one week or cycle. Each lane is a 1px-bordered
	 * column with a grey header cell: the person's login on the left and the
	 * committed/cap totals as plain text on the right. Work with no active
	 * maintainer sits in an unassigned bucket; unestimated issues are listed
	 * separately because they contribute no committed minutes. Empty lanes keep
	 * their header and fixed height so the column stays legible.
	 */
	interface Props {
		lanes: PlanLane[];
		unassigned: PlanUnassigned;
		unestimated: PlanningIssue[];
		allocationPercent?: number;
		/** Writers get a remove control on every planned issue. */
		mayWrite?: boolean;
		onremove?: (issue: PlanningIssue) => void;
		removing?: string | null;
		emptyLabel?: string;
	}

	let {
		lanes,
		unassigned,
		unestimated,
		allocationPercent = 60,
		mayWrite = false,
		onremove,
		removing = null,
		emptyLabel = 'Nothing is planned for this window yet.'
	}: Props = $props();

	function issueKey(issue: PlanningIssue): string {
		return `${issue.repo}#${issue.number}`;
	}

	function sizeLabel(size: string | null): string {
		return size === null ? '—' : size.toUpperCase();
	}
</script>

<div class="flex flex-col gap-3" data-testid="plan-lanes">
	{#if lanes.length === 0}
		<Empty.Root class="border-0 py-8">
			<Empty.Description>{emptyLabel}</Empty.Description>
		</Empty.Root>
	{:else}
		{#each lanes as lane (lane.maintainer.externalId)}
			<section
				class="flex min-h-28 flex-col border border-[color:var(--border)]"
				data-lane={lane.maintainer.login}
			>
				<div class="bug-table-head flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
					<span class="flex min-w-0 items-baseline gap-2">
						<a
							class="link min-w-0 truncate"
							href={`https://github.com/${lane.maintainer.login}`}
							target="_blank"
							rel="noreferrer"
						>
							@{lane.maintainer.login}
						</a>
						<span class="flag flag-muted shrink-0">
							{formatMinutes(lane.maintainer.weeklyMinutes)} net
						</span>
					</span>
					<span class="flex shrink-0 items-baseline gap-2 text-xs">
						<span class="mono tabular-nums">
							{formatMinutes(lane.committedMinutes)} committed · {formatMinutes(lane.capMinutes)} cap
						</span>
						{#if lane.over}
							<span class="flag flag-danger">over</span>
						{/if}
					</span>
				</div>

				<div class="border-b border-[color:var(--border)] px-2 py-1.5">
					<CapacityBar
						class="max-w-64"
						committedMinutes={lane.committedMinutes}
						capMinutes={lane.capMinutes}
						{allocationPercent}
					/>
				</div>

				{#if lane.issues.length === 0}
					<p class="text-muted-foreground px-2 py-2 text-xs">No planned issues.</p>
				{:else}
					<ul class="flex flex-col">
						{#each lane.issues as issue (issueKey(issue))}
							{@render issueRow(issue)}
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	{/if}

	<section
		class="flex min-h-24 flex-col border border-[color:var(--border)]"
		data-testid="unassigned"
	>
		<div class="bug-table-head flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
			<span class="min-w-0 truncate">Unassigned</span>
			<span class="mono shrink-0 text-xs tabular-nums">
				{formatMinutes(unassigned.committedMinutes)} committed · no active maintainer
			</span>
		</div>
		{#if unassigned.issues.length === 0}
			<p class="text-muted-foreground px-2 py-2 text-xs">No unassigned work.</p>
		{:else}
			<ul class="flex flex-col">
				{#each unassigned.issues as issue (issueKey(issue))}
					{@render issueRow(issue)}
				{/each}
			</ul>
		{/if}
	</section>

	{#if unestimated.length > 0}
		<section
			class="flex min-h-24 flex-col border border-[color:var(--border)]"
			data-testid="unestimated"
		>
			<div class="bug-table-head flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
				<span class="min-w-0 truncate">Unestimated</span>
				<span class="text-muted-foreground shrink-0 text-xs">
					Add a size label to schedule these.
				</span>
			</div>
			<ul class="flex flex-col">
				{#each unestimated as issue (issueKey(issue))}
					{@render issueRow(issue)}
				{/each}
			</ul>
		</section>
	{/if}
</div>

{#snippet issueRow(issue: PlanningIssue)}
	<li
		class="group/issue flex min-w-0 items-baseline gap-2 border-b border-[color:var(--border)] px-2 py-1 last:border-b-0"
	>
		<a
			class="flex min-w-0 flex-1 items-baseline gap-2"
			href={issuePath('issues', issue.repo, issue.number)}
		>
			<span class="flag flag-muted shrink-0">{issue.repo}#{issue.number}</span>
			<span class="min-w-0 truncate text-sm">{issue.title}</span>
		</a>
		<span class="flag flag-muted shrink-0">{sizeLabel(issue.size)}</span>
		{#if mayWrite && onremove}
			<button
				type="button"
				class="text-muted-foreground hover:text-destructive shrink-0 text-2xs opacity-0 group-hover/issue:opacity-100 focus-visible:opacity-100"
				disabled={removing === issueKey(issue)}
				title="Remove from plan"
				aria-label={`Remove ${issue.repo}#${issue.number} from the plan`}
				onclick={() => onremove?.(issue)}
			>
				Remove
			</button>
		{/if}
	</li>
{/snippet}
