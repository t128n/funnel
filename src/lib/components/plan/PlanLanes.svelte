<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Empty from '#lib/components/ui/empty';
	import type { PlanningIssue } from '#lib/server/planning/queries';
	import type { PlanLane, PlanUnassigned } from '#lib/server/planning/plans';
	import { issuePath } from '#lib/issue-url';
	import { formatMinutes } from '#lib/planning';
	import { cn } from '#lib/utils';
	import XIcon from '@lucide/svelte/icons/x';
	import CapacityBar from './CapacityBar.svelte';

	/**
	 * Maintainer lanes for one week or cycle. Each lane leads with the person,
	 * then committed / cap and the 60% allocation marker. Work with no active
	 * maintainer sits in an unassigned bucket; unestimated issues are listed
	 * separately because they contribute no committed minutes.
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
				class="border-[color:var(--surface-divider)] flex flex-col gap-1.5 rounded-lg border p-3"
				data-lane={lane.maintainer.login}
			>
				<div class="flex min-w-0 items-center gap-2">
					<Avatar
						login={lane.maintainer.login}
						avatarUrl={lane.maintainer.avatarUrl}
						size={20}
					/>
					<a
						class="focus-visible:ring-ring/50 min-w-0 truncate rounded text-sm font-medium outline-none hover:underline focus-visible:ring-2"
						href={`https://github.com/${lane.maintainer.login}`}
						target="_blank"
						rel="noreferrer"
					>
						@{lane.maintainer.login}
					</a>
					<span class="text-muted-foreground shrink-0 text-[11px] tabular-nums">
						{formatMinutes(lane.maintainer.weeklyMinutes)} net
					</span>
					{#if lane.over}
						<span class="text-destructive ms-auto shrink-0 text-[11px] font-medium">over</span>
					{/if}
					<CapacityBar
						class={cn('ms-auto w-full max-w-64', lane.over && 'shrink-0')}
						committedMinutes={lane.committedMinutes}
						capMinutes={lane.capMinutes}
						{allocationPercent}
					/>
				</div>

				{#if lane.issues.length === 0}
					<p class="text-muted-foreground ps-7 text-[11px]">No planned issues.</p>
				{:else}
					<ul class="flex flex-col gap-0.5 ps-7">
						{#each lane.issues as issue (issueKey(issue))}
							{@render issueRow(issue)}
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	{/if}

	<section
		class="border-[color:var(--surface-divider)] flex flex-col gap-1.5 rounded-lg border border-dashed p-3"
		data-testid="unassigned"
	>
		<div class="flex min-w-0 items-center gap-2">
			<span class="text-sm font-medium">Unassigned</span>
			<span class="text-muted-foreground text-[11px] tabular-nums">
				{formatMinutes(unassigned.committedMinutes)} committed · no active maintainer
			</span>
		</div>
		{#if unassigned.issues.length === 0}
			<p class="text-muted-foreground ps-1 text-[11px]">No unassigned work.</p>
		{:else}
			<ul class="flex flex-col gap-0.5">
				{#each unassigned.issues as issue (issueKey(issue))}
					{@render issueRow(issue)}
				{/each}
			</ul>
		{/if}
	</section>

	{#if unestimated.length > 0}
		<section
			class="border-[color:var(--surface-divider)] flex flex-col gap-1.5 rounded-lg border border-dashed p-3"
			data-testid="unestimated"
		>
			<div class="flex min-w-0 items-center gap-2">
				<span class="text-sm font-medium">Unestimated</span>
				<span class="text-muted-foreground text-[11px]">
					Add a size label to schedule these.
				</span>
			</div>
			<ul class="flex flex-col gap-0.5">
				{#each unestimated as issue (issueKey(issue))}
					{@render issueRow(issue)}
				{/each}
			</ul>
		</section>
	{/if}
</div>

{#snippet issueRow(issue: PlanningIssue)}
	<li class="group/issue flex min-w-0 items-center gap-2 rounded px-1 py-0.5">
		<a
			class="focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded text-xs outline-none hover:underline focus-visible:ring-2"
			href={issuePath('issues', issue.repo, issue.number)}
		>
			<span class="text-muted-foreground me-1.5 tabular-nums">{issue.repo}#{issue.number}</span>
			{issue.title}
		</a>
		<span class="text-muted-foreground shrink-0 text-[10px]">{sizeLabel(issue.size)}</span>
		{#if mayWrite && onremove}
			<Button
				variant="ghost"
				size="icon-xs"
				class="opacity-0 group-hover/issue:opacity-100 focus-visible:opacity-100"
				disabled={removing === issueKey(issue)}
				title="Remove from plan"
				aria-label={`Remove ${issue.repo}#${issue.number} from the plan`}
				onclick={() => onremove?.(issue)}
			>
				<XIcon />
			</Button>
		{/if}
	</li>
{/snippet}
