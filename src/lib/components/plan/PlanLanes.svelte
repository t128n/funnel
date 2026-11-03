<script lang="ts">
	import {
		Button,
		Dropdown,
		DropdownItem,
		DropdownMenu,
		DropdownToggle
	} from '@sveltestrap/sveltestrap';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import { issuePath } from '#lib/issue-url';
	import { formatMinutes } from '#lib/planning';
	import type { PlanningIssue } from '#lib/server/planning/queries';
	import type { PlanLane, PlanUnassigned } from '#lib/server/planning/plans';
	import CapacityBar from './CapacityBar.svelte';

	/**
	 * Maintainer lanes for one week or cycle. Each lane is a ruled section with
	 * a quiet heading, net weekly availability, the cap for this window and a
	 * scheduled/cap meter. `capMinutes` already includes allocation and the
	 * window length, so the bar has no allocation marker. Work with no active
	 * maintainer sits in its own unassigned section; unestimated issues are
	 * listed separately because they contribute no scheduled minutes.
	 */
	interface Props {
		lanes: PlanLane[];
		unassigned: PlanUnassigned;
		unestimated: PlanningIssue[];
		/** Instance allocation percentage; the cap already includes it. */
		allocationPercent?: number;
		/** Weeks in this window, used to explain a multi-week cycle cap. */
		capWeeks?: number;
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
		capWeeks = 1,
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

	function capLabel(lane: PlanLane): string {
		const cap = `Cap ${formatMinutes(lane.capMinutes)}`;
		if (capWeeks <= 1) return `${cap} · ${allocationPercent}% of net`;
		return `${cap} · ${capWeeks} weeks at ${allocationPercent}% of net`;
	}
</script>

<div class="d-flex flex-column" data-testid="plan-lanes">
	{#if lanes.length > 0 && plannedCount === 0}
		<EmptyState
			title={emptyLabel}
			description="Schedule an issue to commit work to a maintainer."
			class="border-top border-bottom py-3"
		>
			{#snippet action()}
				{#if mayWrite && onschedule}
					<Button color="primary" size="sm" onclick={onschedule}>Schedule Issue</Button>
				{/if}
			{/snippet}
		</EmptyState>
	{/if}

	{#if lanes.length === 0}
		<EmptyState
			title="No capacity lanes."
			description="Add active maintainers in Planning settings to open capacity lanes."
			class="border-top border-bottom py-5"
		/>
	{:else}
		{#each lanes as lane (lane.maintainer.externalId)}
			<section class="d-flex flex-column border-top pt-3" data-lane={lane.maintainer.login}>
				<header
					class="d-flex flex-wrap align-items-baseline gap-2 border-bottom px-3 pb-2"
				>
					<h2 class="min-w-0 text-truncate text-body fw-semibold small mb-0">
						<a
							class="link-body-emphasis text-decoration-none"
							href={`https://github.com/${lane.maintainer.login}`}
							target="_blank"
							rel="noreferrer"
						>
							@{lane.maintainer.login}
						</a>
					</h2>
					<span class="small text-body-secondary tnum">
						Net {formatMinutes(lane.maintainer.weeklyMinutes)}/week
					</span>
					<span class="ms-auto small text-body-secondary tnum">
						{capLabel(lane)}
					</span>
				</header>

				<div class="px-3 py-2">
					<CapacityBar
						committedMinutes={lane.committedMinutes}
						capMinutes={lane.capMinutes}
					/>
				</div>

				{#if lane.issues.length === 0}
					<p class="px-3 pb-2 small text-body-secondary mb-0">No planned issues.</p>
				{:else}
					<ul class="d-flex flex-column list-unstyled mb-0">
						{#each lane.issues as issue (issueKey(issue))}
							{@render issueRow(issue, true)}
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	{/if}

	{#if unassigned.issues.length === 0}
		<p
			class="mt-3 d-flex flex-wrap align-items-baseline gap-2 border-top px-3 py-2 small mb-0"
			data-testid="unassigned"
		>
			<span class="fw-semibold text-body">Unassigned</span>
			<span class="text-body-secondary">None — every sized issue has an active assignee.</span>
		</p>
	{:else}
		<section
			class="mt-3 d-flex flex-column border-top pt-3"
			data-testid="unassigned"
		>
			<header class="d-flex flex-wrap align-items-baseline gap-2 border-bottom px-3 pb-2">
				<h2 class="text-body fw-semibold small mb-0">Unassigned</h2>
				<span class="ms-auto small text-body-secondary tnum">
					Scheduled {formatMinutes(unassigned.committedMinutes)} · no cap
				</span>
			</header>
			<p class="px-3 py-2 small text-body-secondary mb-0">
				No active maintainer. Assign these issues to a configured maintainer to place them
				in a lane.
			</p>
			<ul class="d-flex flex-column list-unstyled mb-0">
				{#each unassigned.issues as issue (issueKey(issue))}
					{@render issueRow(issue, true)}
				{/each}
			</ul>
		</section>
	{/if}

	{#if unestimated.length === 0}
		<p
			class="mt-3 d-flex flex-wrap align-items-baseline gap-2 border-top px-3 py-2 small mb-0"
			data-testid="unestimated"
		>
			<span class="fw-semibold text-body">Unestimated</span>
			<span class="text-body-secondary">None — every open issue has a size.</span>
		</p>
	{:else}
		<section
			class="mt-3 d-flex flex-column border-top pt-3"
			data-testid="unestimated"
		>
			<header class="d-flex flex-wrap align-items-baseline gap-2 border-bottom px-3 pb-2">
				<h2 class="text-body fw-semibold small mb-0">Unestimated</h2>
				<span class="ms-auto small text-body-secondary tnum">
					{unestimated.length} {unestimated.length === 1 ? 'issue' : 'issues'}
				</span>
			</header>
			<p class="px-3 py-2 small text-body-secondary mb-0">
				These open issues have no size label. Add a size to make them schedulable.
			</p>
			<ul class="d-flex flex-column list-unstyled mb-0">
				{#each unestimated as issue (issueKey(issue))}
					{@render issueRow(issue, false)}
				{/each}
			</ul>
		</section>
	{/if}
</div>

{#snippet issueRow(issue: PlanningIssue, removable: boolean)}
	<li
		class="plan-issue-row d-flex min-w-0 align-items-center gap-2 border-bottom px-3"
	>
		<a
			class="d-flex min-w-0 flex-grow-1 flex-column gap-1 text-decoration-none text-body"
			href={issuePath('issues', issue.repo, issue.number)}
		>
			<span class="d-flex min-w-0 align-items-center gap-2">
				<span class="font-monospace flex-shrink-0 text-body-secondary">{issue.repo}#{issue.number}</span>
				<span class="min-w-0 text-truncate text-body">{issue.title}</span>
			</span>
			<span class="small text-body-secondary tnum d-sm-none">
				{sizeLabel(issue.size)} · {estimateLabel(issue)}
			</span>
		</a>
		<span
			class="d-none d-sm-block flex-shrink-0 text-end small text-body-secondary"
			style="width: 1.5rem"
			title="Size"
		>
			<span class="visually-hidden">Size </span>{sizeLabel(issue.size)}
		</span>
		<span
			class="d-none d-sm-block flex-shrink-0 text-end small text-body-secondary tnum"
			style="width: 3rem"
			title="Estimated hours"
		>
			<span class="visually-hidden">Estimate </span>{estimateLabel(issue)}
		</span>
		<div class="d-flex flex-shrink-0 align-items-center justify-content-end gap-1 row-actions">
			{#if mayWrite && onremove && removable}
				<Button
					color="link"
					size="sm"
					class="lane-remove d-none d-sm-inline-flex text-decoration-none text-body-secondary p-0 small"
					disabled={removing === issueKey(issue)}
					aria-label={`Remove ${issue.repo}#${issue.number} from the plan`}
					onclick={() => onremove?.(issue)}
				>
					Remove
				</Button>
				<Dropdown>
					<DropdownToggle
						color="link"
						size="sm"
						caret={false}
						class="text-body-secondary text-decoration-none px-1"
						aria-label={`Actions for ${issue.repo}#${issue.number}`}
						title={`Actions for ${issue.repo}#${issue.number}`}
					>
						<i class="bi bi-three-dots" aria-hidden="true"></i>
					</DropdownToggle>
					<DropdownMenu end class="plan-issue-menu">
						<DropdownItem
							class="text-danger"
							disabled={removing === issueKey(issue)}
							on:click={() => onremove?.(issue)}
						>
							Remove from plan
						</DropdownItem>
					</DropdownMenu>
				</Dropdown>
			{:else if mayWrite && onremove && !removable}
				<Button
					color="link"
					size="sm"
					href={issuePath('issues', issue.repo, issue.number)}
					class="text-decoration-none"
					aria-label={`Estimate ${issue.repo}#${issue.number}`}
				>
					Estimate
				</Button>
			{/if}
		</div>
	</li>
{/snippet}

<style>
	.plan-issue-row {
		min-height: var(--funnel-row-compact);
	}

	.plan-issue-row:last-child {
		border-bottom: 0 !important;
	}

	.plan-issue-row:hover :global(.lane-remove) {
		opacity: 1;
	}

	:global(.lane-remove) {
		opacity: 0;
	}

	:global(.lane-remove:focus-visible) {
		opacity: 1;
	}

	.row-actions {
		width: 5rem;
	}

	:global(.plan-issue-menu) {
		min-width: 11rem;
	}

	@media (max-width: 575.98px) {
		.row-actions {
			width: auto;
		}
	}
</style>
