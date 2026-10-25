<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import DayPlan from '#lib/components/plan/DayPlan.svelte';
	import MilestonePlans from '#lib/components/plan/MilestonePlans.svelte';
	import PlanLanes from '#lib/components/plan/PlanLanes.svelte';
	import ScheduleDialog from '#lib/components/plan/ScheduleDialog.svelte';
	import { scheduleWeekFor, unscheduleRequest } from '#lib/components/plan/schedule';
	import { Button } from '#lib/components/ui/button';
	import * as Empty from '#lib/components/ui/empty';
	import type { MilestonePlan } from '#lib/server/planning/milestones';
	import type { PlanningIssue } from '#lib/server/planning/queries';
	import type { CyclePlan, WeekPlan } from '#lib/server/planning/plans';
	import type { DayView } from '#/routes/(app)/plan/+page.server';
	import { formatMinutes } from '#lib/planning';
	import { canWrite } from '#lib/roles';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import PlusIcon from '@lucide/svelte/icons/plus';

	/**
	 * The three planning horizons over one loaded payload. The server owns
	 * validation and the default week; this page only chooses what to render and
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
		dayView?: DayView | null;
		user?: { role?: unknown } | null;
	}

	let { data }: { data: PlanData } = $props();

	let dialogOpen = $state(false);
	let removing = $state<string | null>(null);

	const horizon = $derived(
		data.horizon === 'cycle' || data.horizon === 'milestone' || data.horizon === 'day'
			? data.horizon
			: 'week'
	);
	const week = $derived(data.week ?? data.weekPlan?.weekStart ?? '');
	const cycleKey = $derived(
		typeof data.cycle === 'string'
			? data.cycle
			: (data.cycle?.key ?? data.cyclePlan?.key ?? week)
	);
	const mayWrite = $derived(canWrite(data.user?.role));
	const allocationPercent = $derived(data.allocationPercent ?? 60);
	const candidates = $derived(data.candidates ?? []);
	const milestones = $derived(data.milestones ?? []);
	const scheduleWeek = $derived(
		scheduleWeekFor(
			horizon,
			week,
			data.cyclePlan?.weeks[0]?.weekStart ?? cycleKey
		)
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
			const candidate =
				record[kind] ?? record.key ?? record.weekStart ?? record.start ?? null;
			if (typeof candidate === 'string' && candidate.length > 0) return candidate;
		}
		return null;
	}

	const previous = $derived(
		horizon === 'milestone'
			? null
			: navValue(data.previous, horizon === 'cycle' ? 'cycle' : 'week')
	);
	const next = $derived(
		horizon === 'milestone'
			? null
			: navValue(data.next, horizon === 'cycle' ? 'cycle' : 'week')
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
			: horizon === 'day' ? horizonHref('day', next) : horizonHref(horizon, next)
	);

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
		try {
			const request = unscheduleRequest(issue.repo, issue.number);
			const response = await fetch(request.url, { method: request.method });
			if (response.ok) await invalidateAll();
		} finally {
			removing = null;
		}
	}
</script>

<PageHead
	title="Plan"
	description="Week, cycle and milestone capacity across the maintainer roster."
/>

<div class="surface-shell bg-[var(--surface-canvas)] flex min-h-0 flex-1 flex-col overflow-y-auto">
	<header
		class="border-[color:var(--surface-divider)] flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5"
	>
		<h1 class="me-1 text-base font-semibold tracking-tight">Plan</h1>

		<nav class="flex items-center gap-0.5" aria-label="Planning horizon">
			<Button
				variant={horizon === 'week' ? 'secondary' : 'ghost'}
				size="sm"
				href={horizonHref('week', week)}
				aria-current={horizon === 'week' ? 'page' : undefined}
			>
				Week
			</Button>
			<Button
				variant={horizon === 'cycle' ? 'secondary' : 'ghost'}
				size="sm"
				href={horizonHref('cycle', cycleKey)}
				aria-current={horizon === 'cycle' ? 'page' : undefined}
			>
				Cycle
			</Button>
			<Button
				variant={horizon === 'milestone' ? 'secondary' : 'ghost'}
				size="sm"
				href={horizonHref('milestone')}
				aria-current={horizon === 'milestone' ? 'page' : undefined}
			>
				Milestone
			</Button>
			<Button
				variant={horizon === 'day' ? 'secondary' : 'ghost'}
				size="sm"
				href={horizonHref('day', data.dayView?.date)}
				aria-current={horizon === 'day' ? 'page' : undefined}
			>
				Day
			</Button>
		</nav>

		{#if horizon !== 'milestone'}
			<div class="flex items-center gap-0.5">
				<Button
					variant="ghost"
					size="icon-sm"
					disabled={previousHref === null}
					href={previousHref ?? undefined}
					aria-label="Previous period"
					title="Previous period"
				>
					<ChevronLeftIcon />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					disabled={nextHref === null}
					href={nextHref ?? undefined}
					aria-label="Next period"
					title="Next period"
				>
					<ChevronRightIcon />
				</Button>
			</div>
		{/if}

		<span class="text-muted-foreground min-w-0 truncate text-xs">
			{#if horizon === 'week'}
				{data.weekPlan?.label ?? week}
			{:else if horizon === 'cycle'}
				{data.cyclePlan ? `${data.cyclePlan.start} → ${data.cyclePlan.end}` : cycleKey}
			{:else if horizon === 'day'}
				{data.dayView?.label ?? 'Day'}
			{:else}
				Open milestones with open issues
			{/if}
		</span>

		{#if mayWrite && horizon !== 'milestone' && horizon !== 'day'}
			<Button
				size="sm"
				class="ms-auto"
				disabled={scheduleWeek.length === 0}
				onclick={() => (dialogOpen = true)}
			>
				<PlusIcon />
				Schedule issue
			</Button>
		{/if}
	</header>

	<div class="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
		{#if horizon === 'week'}
			{#if data.weekPlan}
				<PlanLanes
					lanes={data.weekPlan.lanes}
					unassigned={data.weekPlan.unassigned}
					unestimated={data.weekPlan.unestimated}
					{allocationPercent}
					{mayWrite}
					onremove={remove}
					{removing}
				/>
			{:else}
				<Empty.Root class="border-0 py-10">
					<Empty.Description>No week loaded.</Empty.Description>
				</Empty.Root>
			{/if}
		{:else if horizon === 'cycle'}
			{#if data.cyclePlan}
				<section class="flex flex-col gap-2" aria-label="Per-week summaries" data-testid="week-summaries">
					<h2 class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
						Weeks in this cycle
					</h2>
					<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{#each data.cyclePlan.weeks as item (item.weekStart)}
							{@const totals = laneTotals(item.lanes)}
							<a
								href={horizonHref('week', item.weekStart)}
								class="border-[color:var(--surface-divider)] hover:bg-[var(--surface-card-hover)] flex flex-col gap-1 rounded-lg border p-2.5 transition-colors"
							>
								<span class="text-xs font-medium">{item.label}</span>
								<span class="text-muted-foreground flex items-center justify-between text-[11px] tabular-nums">
									<span>{formatMinutes(totals.committed)} committed</span>
									<span>{formatMinutes(totals.cap)} cap</span>
								</span>
								{#if item.unassigned.committedMinutes > 0}
									<span class="text-muted-foreground text-[10px] tabular-nums">
										{formatMinutes(item.unassigned.committedMinutes)} unassigned
									</span>
								{/if}
							</a>
						{/each}
					</div>
				</section>

				<PlanLanes
					lanes={data.cyclePlan.lanes}
					unassigned={data.cyclePlan.unassigned}
					unestimated={data.cyclePlan.unestimated}
					{allocationPercent}
					{mayWrite}
					onremove={remove}
					{removing}
					emptyLabel="Nothing is planned in this cycle yet."
				/>
			{:else}
				<Empty.Root class="border-0 py-10">
					<Empty.Description>No cycle loaded.</Empty.Description>
				</Empty.Root>
			{/if}
		{:else if horizon === 'day'}
			{#if data.dayView}
				<DayPlan view={data.dayView} {mayWrite} />
			{:else}
				<Empty.Root class="border-0 py-10">
					<Empty.Description>No day loaded.</Empty.Description>
				</Empty.Root>
			{/if}
		{:else}
			<MilestonePlans plans={milestones} {allocationPercent} />
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
