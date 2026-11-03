<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, ButtonGroup, Table } from '@sveltestrap/sveltestrap';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import DayPlan from '#lib/components/plan/DayPlan.svelte';
	import MilestonePlans from '#lib/components/plan/MilestonePlans.svelte';
	import PlanLanes from '#lib/components/plan/PlanLanes.svelte';
	import ScheduleDialog from '#lib/components/plan/ScheduleDialog.svelte';
	import { cycleHeadline, dayHeadline, weekHeadline } from '#lib/components/plan/format';
	import { scheduleWeekFor, unscheduleRequest } from '#lib/components/plan/schedule';
	import type { MilestonePlan } from '#lib/server/planning/milestones';
	import type { PlanningIssue } from '#lib/server/planning/queries';
	import type { CyclePlan, WeekPlan } from '#lib/server/planning/plans';
	import type { DayView } from '#/routes/(app)/plan/+page.server';
	import { formatMinutes } from '#lib/planning';
	import { canWrite } from '#lib/roles';

	/**
	 * The four planning horizons over one loaded payload. The server owns
	 * validation and the default week; this page chooses what to render and
	 * posts plan mutations through the guarded API.
	 */
	interface PlanData {
		horizon?: string;
		week?: string;
		cycle?: string | CyclePlan | null;
		previous?: unknown;
		next?: unknown;
		weekPlan?: WeekPlan | null;
		cyclePlan?: CyclePlan | null;
		milestones?: MilestonePlan[];
		candidates?: PlanningIssue[];
		allocationPercent?: number;
		sizeMinutes?: Record<string, number>;
		today?: { week?: string; cycle?: string; day?: string } | null;
		dayView?: DayView | null;
		user?: { role?: unknown } | null;
	}

	let { data }: { data: PlanData } = $props();

	let dialogOpen = $state(false);
	let removing = $state<string | null>(null);
	let removeError = $state<string | null>(null);
	let failedRemove = $state<PlanningIssue | null>(null);

	const horizon = $derived(
		data.horizon === 'cycle' || data.horizon === 'milestone' || data.horizon === 'day'
			? data.horizon
			: 'week'
	);
	const week = $derived(data.week ?? data.weekPlan?.weekStart ?? '');
	const cycleKey = $derived(
		typeof data.cycle === 'string' ? data.cycle : (data.cycle?.key ?? data.cyclePlan?.key ?? week)
	);
	const mayWrite = $derived(canWrite(data.user?.role));
	// The day plan is personal: any signed-in viewer edits their own rows
	// through `/api/me/*`, regardless of the workspace write role.
	const mayPlanDay = $derived(data.user != null);
	const allocationPercent = $derived(data.allocationPercent ?? 60);
	const sizeMinutes = $derived(data.sizeMinutes ?? {});
	const candidates = $derived(data.candidates ?? []);
	const milestones = $derived(data.milestones ?? []);
	const scheduleWeek = $derived(
		scheduleWeekFor(horizon, week, data.cyclePlan?.weeks[0]?.weekStart ?? cycleKey)
	);

	const horizonTitle = $derived(
		horizon === 'week'
			? weekHeadline(week)
			: horizon === 'cycle'
				? cycleHeadline(data.cyclePlan?.key ?? cycleKey)
				: horizon === 'day'
					? dayHeadline(data.dayView?.date ?? week)
					: 'Milestones'
	);

	function horizonHref(next: 'week' | 'cycle' | 'milestone' | 'day', value?: string): string {
		// Week, cycle and day links carry their own cursor; day is `/plan?horizon=day&day=…`.
		const params = new URLSearchParams({ horizon: next });
		if (next === 'week' && value) params.set('week', value);
		if (next === 'cycle' && value) params.set('cycle', value);
		if (next === 'day' && value) params.set('day', value);
		return `/plan?${params.toString()}`;
	}

	/** `previous`/`next` may be a date string or a small navigation object. */
	function navValue(value: unknown, kind: 'week' | 'cycle'): string | null {
		if (typeof value === 'string' && value.length > 0) return value;
		if (value !== null && typeof value === 'object') {
			const record = value as Record<string, unknown>;
			const candidate = record[kind] ?? record.key ?? record.weekStart ?? record.start ?? null;
			if (typeof candidate === 'string' && candidate.length > 0) return candidate;
		}
		return null;
	}

	const previous = $derived(
		horizon === 'milestone' ? null : navValue(data.previous, horizon === 'cycle' ? 'cycle' : 'week')
	);
	const next = $derived(
		horizon === 'milestone' ? null : navValue(data.next, horizon === 'cycle' ? 'cycle' : 'week')
	);
	const previousHref = $derived(
		previous === null
			? null
			: horizon === 'day'
				? horizonHref('day', previous)
				: horizonHref(horizon, previous)
	);
	const nextHref = $derived(
		next === null
			? null
			: horizon === 'day'
				? horizonHref('day', next)
				: horizonHref(horizon, next)
	);

	const isCurrent = $derived(
		horizon === 'week'
			? week === data.today?.week
			: horizon === 'cycle'
				? cycleKey === data.today?.cycle
				: horizon === 'day'
					? (data.dayView?.date ?? '') === (data.today?.day ?? '')
					: true
	);
	const todayHref = $derived(
		horizon === 'day' ? '/plan?horizon=day' : `/plan?horizon=${horizon}`
	);

	const horizons = $derived([
		{ key: 'week' as const, label: 'Week', href: horizonHref('week', week) },
		{ key: 'cycle' as const, label: 'Cycle', href: horizonHref('cycle', cycleKey) },
		{ key: 'milestone' as const, label: 'Milestones', href: horizonHref('milestone') },
		{ key: 'day' as const, label: 'Day', href: horizonHref('day', data.dayView?.date) }
	]);
	const horizonName = $derived(horizons.find((item) => item.key === horizon)?.label ?? 'period');

	function laneTotals(lanes: WeekPlan['lanes']): { committed: number; cap: number } {
		return lanes.reduce(
			(total, lane) => ({
				committed: total.committed + lane.committedMinutes,
				cap: total.cap + lane.capMinutes
			}),
			{ committed: 0, cap: 0 }
		);
	}

	function issueKey(issue: PlanningIssue): string {
		return `${issue.repo}#${issue.number}`;
	}

	async function remove(issue: PlanningIssue) {
		const key = issueKey(issue);
		removing = key;
		removeError = null;
		failedRemove = null;
		try {
			const request = unscheduleRequest(issue.repo, issue.number);
			const response = await fetch(request.url, { method: request.method });
			if (!response.ok) {
				removeError = `Could not remove ${key} from the plan (${response.status}).`;
				failedRemove = issue;
				return;
			}
			await invalidateAll();
		} catch {
			removeError = `Could not remove ${key} from the plan. Check your connection.`;
			failedRemove = issue;
		} finally {
			removing = null;
		}
	}
</script>

<PageHead title={`${horizonTitle} · Plan`} description="Week, cycle, milestone and day capacity planning." />

<main class="container-fluid px-3 px-lg-4 py-4">
	<PageHeader title={horizonTitle}>
		{#snippet actions()}
			{#if mayWrite && horizon !== 'milestone' && horizon !== 'day'}
				<Button
					color="primary"
					size="sm"
					disabled={scheduleWeek.length === 0}
					onclick={() => (dialogOpen = true)}
				>
					Schedule Issue
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<nav
		class="d-flex flex-wrap align-items-center gap-2 border-bottom pb-2 mb-3"
		aria-label="Planning horizon"
	>
		<ButtonGroup size="sm" role="group" aria-label="Planning horizon">
			{#each horizons as item (item.key)}
				<Button
					color="outline-secondary"
					href={item.href}
					active={horizon === item.key}
					aria-current={horizon === item.key ? 'page' : undefined}
				>
					{item.label}
				</Button>
			{/each}
		</ButtonGroup>

		{#if horizon !== 'milestone'}
			<div class="ms-auto d-flex align-items-center gap-1">
				{#if previousHref}
					<Button
						color="link"
						size="sm"
						href={previousHref}
						class="text-body-secondary text-decoration-none px-1"
						aria-label={`Previous ${horizonName.toLowerCase()}`}
						title={`Previous ${horizonName.toLowerCase()}`}
					>
						<i class="bi bi-chevron-left" aria-hidden="true"></i>
					</Button>
				{:else}
					<Button
						color="link"
						size="sm"
						disabled
						class="text-body-secondary text-decoration-none px-1"
						aria-label={`Previous ${horizonName.toLowerCase()}`}
					>
						<i class="bi bi-chevron-left" aria-hidden="true"></i>
					</Button>
				{/if}

				{#if !isCurrent}
					<a class="link-primary px-2" href={todayHref}>Today</a>
				{/if}

				{#if nextHref}
					<Button
						color="link"
						size="sm"
						href={nextHref}
						class="text-body-secondary text-decoration-none px-1"
						aria-label={`Next ${horizonName.toLowerCase()}`}
						title={`Next ${horizonName.toLowerCase()}`}
					>
						<i class="bi bi-chevron-right" aria-hidden="true"></i>
					</Button>
				{:else}
					<Button
						color="link"
						size="sm"
						disabled
						class="text-body-secondary text-decoration-none px-1"
						aria-label={`Next ${horizonName.toLowerCase()}`}
					>
						<i class="bi bi-chevron-right" aria-hidden="true"></i>
					</Button>
				{/if}
			</div>
		{/if}
	</nav>

	<div class="d-flex flex-column gap-3">
		{#if removeError}
			<InlineStatus tone="error" message={removeError}>
				{#snippet action()}
					<Button
						color="link"
						size="sm"
						disabled={removing !== null || failedRemove === null}
						onclick={() => failedRemove && void remove(failedRemove)}
					>
						Retry
					</Button>
				{/snippet}
			</InlineStatus>
		{/if}

		{#if horizon === 'week'}
			{#if data.weekPlan}
				<PlanLanes
					lanes={data.weekPlan.lanes}
					unassigned={data.weekPlan.unassigned}
					unestimated={data.weekPlan.unestimated}
					{allocationPercent}
					{sizeMinutes}
					{mayWrite}
					onschedule={() => (dialogOpen = true)}
					onremove={remove}
					{removing}
				/>
			{:else}
				<EmptyState
					title="No week loaded."
					description="Choose a week from the horizon navigation."
					class="border-top border-bottom py-4"
				/>
			{/if}
		{:else if horizon === 'cycle'}
			{#if data.cyclePlan}
				<section class="d-flex flex-column gap-2" aria-label="Per-week summaries" data-testid="week-summaries">
					<h2 class="fs-6 text-body mb-0">Weeks in this cycle</h2>
					<div class="table-responsive border rounded">
						<Table class="funnel-table table-sm align-middle mb-0">
							<thead class="bg-body-tertiary small text-body-secondary">
								<tr>
									<th scope="col">Week</th>
									<th scope="col" class="text-end">Scheduled</th>
									<th scope="col" class="text-end">Cap</th>
									<th scope="col" class="text-end">Unassigned</th>
								</tr>
							</thead>
							<tbody>
								{#each data.cyclePlan.weeks as item (item.weekStart)}
									{@const totals = laneTotals(item.lanes)}
									<tr>
										<th scope="row" class="fw-normal">
											<a class="link-primary" href={horizonHref('week', item.weekStart)}>{item.label}</a>
										</th>
										<td class="text-end tnum">{formatMinutes(totals.committed)}</td>
										<td class="text-end tnum">{formatMinutes(totals.cap)}</td>
										<td class="text-end tnum">
											{formatMinutes(item.unassigned.committedMinutes)}
										</td>
									</tr>
								{/each}
							</tbody>
						</Table>
					</div>
				</section>

				<PlanLanes
					lanes={data.cyclePlan.lanes}
					unassigned={data.cyclePlan.unassigned}
					unestimated={data.cyclePlan.unestimated}
					{allocationPercent}
					capWeeks={data.cyclePlan.weeks.length}
					{sizeMinutes}
					{mayWrite}
					onschedule={() => (dialogOpen = true)}
					onremove={remove}
					{removing}
					emptyLabel="Nothing is planned in this cycle yet."
				/>
			{:else}
				<EmptyState
					title="No cycle loaded."
					description="Choose a cycle from the horizon navigation."
					class="border-top border-bottom py-4"
				/>
			{/if}
		{:else if horizon === 'day'}
			{#if data.dayView}
				<DayPlan view={data.dayView} mayWrite={mayPlanDay} />
			{:else}
				<EmptyState
					title="No day loaded."
					description="Choose a day from the horizon navigation."
					class="border-top border-bottom py-4"
				/>
			{/if}
		{:else}
			<MilestonePlans plans={milestones} {allocationPercent} {sizeMinutes} />
		{/if}
	</div>
</main>

{#if mayWrite}
	<ScheduleDialog
		open={dialogOpen}
		week={scheduleWeek}
		{candidates}
		onopenchange={(open) => (dialogOpen = open)}
	/>
{/if}

<style>
	.tnum {
		font-variant-numeric: tabular-nums;
	}
</style>
