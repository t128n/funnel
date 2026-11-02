<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
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
	import { Button } from '#lib/components/ui/button';
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

	function tabClass(key: 'week' | 'cycle' | 'milestone' | 'day'): string {
		const base =
			'-mb-px inline-flex h-(--size-row-compact) items-center border-b-2 px-2 text-body';
		return horizon === key
			? `${base} border-primary font-semibold text-fg`
			: `${base} border-transparent text-fg-secondary hover:text-fg`;
	}

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

<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
	<PageHeader title={horizonTitle}>
		{#snippet actions()}
			{#if mayWrite && horizon !== 'milestone' && horizon !== 'day'}
				<Button size="sm" disabled={scheduleWeek.length === 0} onclick={() => (dialogOpen = true)}>
					Schedule Issue
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<nav
		class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border-subtle px-[var(--layout-page-padding)]"
		aria-label="Planning horizon"
	>
		<div class="flex items-stretch gap-1">
			{#each horizons as item (item.key)}
				<a
					href={item.href}
					aria-current={horizon === item.key ? 'page' : undefined}
					class={tabClass(item.key)}
				>
					{item.label}
				</a>
			{/each}
		</div>

		{#if horizon !== 'milestone'}
			<div class="ms-auto flex items-center gap-1">
				{#if previousHref}
					<Button
						variant="ghost"
						size="icon-sm"
						href={previousHref}
						aria-label={`Previous ${horizonName.toLowerCase()}`}
						title={`Previous ${horizonName.toLowerCase()}`}
					>
						<ChevronLeftIcon class="size-4" aria-hidden="true" />
					</Button>
				{:else}
					<Button
						variant="ghost"
						size="icon-sm"
						disabled
						aria-label={`Previous ${horizonName.toLowerCase()}`}
					>
						<ChevronLeftIcon class="size-4" aria-hidden="true" />
					</Button>
				{/if}

				{#if !isCurrent}
					<a class="link px-2 text-body" href={todayHref}>Today</a>
				{/if}

				{#if nextHref}
					<Button
						variant="ghost"
						size="icon-sm"
						href={nextHref}
						aria-label={`Next ${horizonName.toLowerCase()}`}
						title={`Next ${horizonName.toLowerCase()}`}
					>
						<ChevronRightIcon class="size-4" aria-hidden="true" />
					</Button>
				{:else}
					<Button
						variant="ghost"
						size="icon-sm"
						disabled
						aria-label={`Next ${horizonName.toLowerCase()}`}
					>
						<ChevronRightIcon class="size-4" aria-hidden="true" />
					</Button>
				{/if}
			</div>
		{/if}
	</nav>

	<div class="flex w-full flex-col gap-6 px-[var(--layout-page-padding)] py-5">
		{#if removeError}
			<InlineStatus tone="error" message={removeError}>
				{#snippet action()}
					<Button
						variant="ghost"
						size="xs"
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
					class="border-y border-border-subtle py-10"
				/>
			{/if}
		{:else if horizon === 'cycle'}
			{#if data.cyclePlan}
				<section class="flex flex-col gap-2" aria-label="Per-week summaries" data-testid="week-summaries">
					<h2 class="text-heading-sm font-semibold text-fg">Weeks in this cycle</h2>
					<div class="overflow-x-auto">
						<table class="data-table min-w-0">
							<thead>
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
										<th scope="row" class="font-normal">
											<a class="link" href={horizonHref('week', item.weekStart)}>{item.label}</a>
										</th>
										<td class="text-end tabular-nums">{formatMinutes(totals.committed)}</td>
										<td class="text-end tabular-nums">{formatMinutes(totals.cap)}</td>
										<td class="text-end tabular-nums">
											{formatMinutes(item.unassigned.committedMinutes)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
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
					class="border-y border-border-subtle py-10"
				/>
			{/if}
		{:else if horizon === 'day'}
			{#if data.dayView}
				<DayPlan view={data.dayView} mayWrite={mayPlanDay} />
			{:else}
				<EmptyState
					title="No day loaded."
					description="Choose a day from the horizon navigation."
					class="border-y border-border-subtle py-10"
				/>
			{/if}
		{:else}
			<MilestonePlans plans={milestones} {allocationPercent} {sizeMinutes} />
		{/if}
	</div>
</div>

{#if mayWrite}
	<ScheduleDialog
		open={dialogOpen}
		week={scheduleWeek}
		{candidates}
		onopenchange={(open) => (dialogOpen = open)}
	/>
{/if}
