<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu';
	import { issuePath } from '#lib/issue-url';
	import { formatMinutes } from '#lib/planning';
	import type { PlanningIssue } from '#lib/server/planning/queries';
	import type { PlanLane, PlanUnassigned } from '#lib/server/planning/plans';
	import CapacityBar from './CapacityBar.svelte';

	/**
	 * Maintainer lanes for one week or cycle. Each lane is a ruled section with
	 * a `surface-2` header: the person's login, net capacity, committed/cap and
	 * an icon plus word when over. Work with no active maintainer sits in its own
	 * unassigned section; unestimated issues are listed separately because they
	 * contribute no committed minutes.
	 */
	interface Props {
		lanes: PlanLane[];
		unassigned: PlanUnassigned;
		unestimated: PlanningIssue[];
		allocationPercent?: number;
		/** Size label → minutes, supplied by the server's planning settings. */
		sizeMinutes?: Record<string, number>;
		/** Writers get a remove control on every planned issue. */
		mayWrite?: boolean;
		/** Opens the schedule dialog from the empty state. */
		onschedule?: () => void;
		onremove?: (issue: PlanningIssue) => void;
		removing?: string | null;
		emptyLabel?: string;
	}

	let {
		lanes,
		unassigned,
		unestimated,
		allocationPercent = 60,
		sizeMinutes = {},
		mayWrite = false,
		onschedule,
		onremove,
		removing = null,
		emptyLabel = 'Nothing is planned for this window.'
	}: Props = $props();

	const plannedCount = $derived(
		lanes.reduce((total, lane) => total + lane.issues.length, 0) + unassigned.issues.length
	);

	function issueKey(issue: PlanningIssue): string {
		return `${issue.repo}#${issue.number}`;
	}

	function sizeLabel(size: string | null): string {
		if (size === null) return '—';
		if (size === 'sm') return 'S';
		if (size === 'md') return 'M';
		if (size === 'lg') return 'L';
		return size.toUpperCase();
	}

	function estimateLabel(issue: PlanningIssue): string {
		if (issue.size === null) return '—';
		const minutes = sizeMinutes[issue.size] ?? sizeMinutes[issue.size.toLowerCase()];
		return minutes === undefined ? '—' : formatMinutes(minutes);
	}

	function overBy(lane: PlanLane): number {
		return Math.max(0, lane.committedMinutes - lane.capMinutes);
	}
</script>

<div class="flex flex-col" data-testid="plan-lanes">
	{#if lanes.length > 0 && plannedCount === 0}
		<EmptyState
			title={emptyLabel}
			description="Schedule an issue to commit work to a maintainer."
			class="border-y border-border-subtle py-6"
		>
			{#snippet action()}
				{#if mayWrite && onschedule}
					<Button size="sm" onclick={onschedule}>Schedule Issue</Button>
				{/if}
			{/snippet}
		</EmptyState>
	{/if}

	{#if lanes.length === 0}
		<EmptyState
			title="No capacity lanes."
			description="Add active maintainers in Planning settings to open capacity lanes."
			class="border-y border-border-subtle py-10"
		/>
	{:else}
		{#each lanes as lane (lane.maintainer.externalId)}
			<section class="flex flex-col border-t border-border-subtle" data-lane={lane.maintainer.login}>
				<header class="flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface-2 px-3 py-2">
					<a
						class="min-w-0 truncate text-body font-semibold text-fg hover:underline"
						href={`https://github.com/${lane.maintainer.login}`}
						target="_blank"
						rel="noreferrer"
					>
						@{lane.maintainer.login}
					</a>
					<span class="text-caption text-fg-secondary tabular-nums">
						{formatMinutes(lane.maintainer.weeklyMinutes)} net
					</span>
					<span class="ms-auto text-caption text-fg-secondary tabular-nums">
						{formatMinutes(lane.committedMinutes)} / {formatMinutes(lane.capMinutes)}
					</span>
					{#if lane.over}
						<span class="status status-error shrink-0">
							<TriangleAlertIcon aria-hidden="true" />
							<span>Over by {formatMinutes(overBy(lane))}</span>
						</span>
					{/if}
				</header>

				<div class="px-3 py-2">
					<CapacityBar
						committedMinutes={lane.committedMinutes}
						capMinutes={lane.capMinutes}
						{allocationPercent}
						showValue={false}
					/>
				</div>

				{#if lane.issues.length === 0}
					<p class="px-3 pb-2 text-caption text-fg-secondary">No planned issues.</p>
				{:else}
					<ul class="flex flex-col">
						{#each lane.issues as issue (issueKey(issue))}
							{@render issueRow(issue, true)}
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	{/if}

	<section class="mt-4 flex flex-col border-t border-border-subtle" data-testid="unassigned">
		<header class="flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface-2 px-3 py-2">
			<h2 class="text-body font-semibold text-fg">Unassigned</h2>
			<span class="ms-auto text-caption text-fg-secondary tabular-nums">
				{formatMinutes(unassigned.committedMinutes)} committed
			</span>
		</header>
		{#if unassigned.issues.length === 0}
			<p class="px-3 py-2 text-caption text-fg-secondary">No unassigned work.</p>
		{:else}
			<p class="px-3 py-2 text-caption text-fg-secondary">
				No active maintainer. Assign these issues to a configured maintainer to place them
				in a lane.
			</p>
			<ul class="flex flex-col">
				{#each unassigned.issues as issue (issueKey(issue))}
					{@render issueRow(issue, true)}
				{/each}
			</ul>
		{/if}
	</section>

	<section class="mt-4 flex flex-col border-t border-border-subtle" data-testid="unestimated">
		<header class="flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface-2 px-3 py-2">
			<h2 class="text-body font-semibold text-fg">Unestimated</h2>
			<span class="ms-auto text-caption text-fg-secondary tabular-nums">
				{unestimated.length}
			</span>
		</header>
		{#if unestimated.length === 0}
			<p class="px-3 py-2 text-caption text-fg-secondary">Every open issue has an estimate.</p>
		{:else}
			<p class="px-3 py-2 text-caption text-fg-secondary">
				These open issues have no size label. Add a size to make them schedulable.
			</p>
			<ul class="flex flex-col">
				{#each unestimated as issue (issueKey(issue))}
					{@render issueRow(issue, false)}
				{/each}
			</ul>
		{/if}
	</section>
</div>

{#snippet issueRow(issue: PlanningIssue, removable: boolean)}
	<li
		class="group/issue flex min-h-(--size-row-compact) min-w-0 items-center gap-2 border-b border-border-subtle px-3 last:border-b-0"
	>
		<a
			class="flex min-w-0 flex-1 items-center gap-2 hover:underline"
			href={issuePath('issues', issue.repo, issue.number)}
		>
			<span class="mono shrink-0 text-fg-secondary">{issue.repo}#{issue.number}</span>
			<span class="min-w-0 truncate text-body text-fg">{issue.title}</span>
		</a>
		<span class="w-8 shrink-0 text-end text-caption text-fg-secondary" title="Size">
			{sizeLabel(issue.size)}
		</span>
		<span class="w-12 shrink-0 text-end text-caption text-fg-secondary tabular-nums" title="Estimate">
			{estimateLabel(issue)}
		</span>
		{#if mayWrite && onremove && removable}
			<button
				type="button"
				class="shrink-0 text-caption text-fg-secondary opacity-0 hover:text-error focus-visible:opacity-100 group-hover/issue:opacity-100 group-focus-within/issue:opacity-100"
				disabled={removing === issueKey(issue)}
				aria-label={`Remove ${issue.repo}#${issue.number} from the plan`}
				onclick={() => onremove?.(issue)}
			>
				Remove
			</button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex size-(--size-control-sm) shrink-0 items-center justify-center rounded-sm text-fg-secondary hover:bg-surface-2 hover:text-fg"
				>
					<EllipsisIcon class="size-4" aria-hidden="true" />
					<span class="sr-only">Actions for {issue.repo}#{issue.number}</span>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-52">
					<DropdownMenu.Item
						variant="destructive"
						disabled={removing === issueKey(issue)}
						onSelect={() => onremove?.(issue)}
					>
						Remove from plan
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{:else if mayWrite && onremove && !removable}
			<Button
				variant="ghost"
				size="xs"
				href={issuePath('issues', issue.repo, issue.number)}
				aria-label={`Estimate ${issue.repo}#${issue.number}`}
			>
				Estimate
			</Button>
		{/if}
	</li>
{/snippet}
