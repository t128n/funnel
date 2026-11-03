<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button, Table } from '@sveltestrap/sveltestrap';
	import { Chart, type ECMouseEvent } from 'svelte-echarts';
	import { CustomChart, ScatterChart } from 'echarts/charts';
	import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
	import { init, use } from 'echarts/core';
	import { CanvasRenderer } from 'echarts/renderers';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import { resolvedTheme } from '#lib/client/theme';
	import { milestonePath, type TimelineRow, type TimelineWindow } from '#lib/timeline';
	import {
		buildTimelineOptions,
		EMPTY_TIMELINE_OPTIONS,
		type TimelineChartTokens,
	} from './timeline-options';
	import {
		formatDay,
		isAfterDue,
		isOverdue,
		progressText,
		timelineRef,
	} from './timeline-format';

	use([CustomChart, ScatterChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);

	/**
	 * A read-only milestone Gantt. The HTML label column is the accessible list
	 * of milestones; the ECharts canvas is the diagram. Both consume the same
	 * measured row height, so the label rows and canvas bands stay aligned.
	 */
	interface Props {
		rows: TimelineRow[];
		window: TimelineWindow | null;
		now: number;
		undated?: TimelineRow[];
		repoShortcodes?: Record<string, string>;
		emptyTitle?: string;
		emptyDescription?: string;
	}

	let {
		rows,
		window: timelineWindow,
		now,
		undated = [],
		repoShortcodes = {},
		emptyTitle = 'Nothing to plot yet.',
		emptyDescription = 'Open a milestone with a due date, or attach work to one, to see it here.',
	}: Props = $props();

	let labelColumn = $state<HTMLDivElement | null>(null);
	let rowHeight = $state(44);
	let headerHeight = $state(32);
	let tokens = $state<TimelineChartTokens | null>(null);
	let reducedMotion = $state(false);
	let themeName = $state<'light' | 'dark'>('light');

	const datedRows = $derived(rows.filter((row) => row.dueOn !== null));
	const undatedRows = $derived(
		undated.length > 0 ? undated : rows.filter((row) => row.dueOn === null),
	);
	const empty = $derived(datedRows.length === 0 && undatedRows.length === 0);
	const chartHeight = $derived(headerHeight + datedRows.length * rowHeight);
	const hasAfterDue = $derived(datedRows.some((row) => isAfterDue(row)));
	const options = $derived(
		timelineWindow === null || tokens === null
			? EMPTY_TIMELINE_OPTIONS
			: buildTimelineOptions({
					rows: datedRows,
					window: timelineWindow,
					now,
					rowHeight,
					headerHeight,
					tokens,
					repoShortcodes,
					reducedMotion,
				}),
	);

	function rowKey(row: TimelineRow): string {
		return `${row.repo}#${row.number}`;
	}

	function titleOf(row: TimelineRow): string {
		return row.title.trim() || 'Untitled milestone';
	}

	/** Read the active Bootstrap tokens; the canvas must use the same values as CSS. */
	function readTokens(): TimelineChartTokens {
		const style = getComputedStyle(document.documentElement);
		const rootPx = Number.parseFloat(style.fontSize) || 16;
		const token = (name: string): string => style.getPropertyValue(name).trim();
		return {
			fontSans: token('--bs-body-font-family') || 'sans-serif',
			fontMono: token('--bs-font-monospace') || 'monospace',
			captionPx: rootPx * 0.75,
			bodyPx: rootPx * 0.875,
			monoPx: rootPx * 0.8125,
			chart1: token('--funnel-chart-1'),
			chart2: token('--funnel-chart-2'),
			chart3: token('--funnel-chart-3'),
			borderSubtle: token('--bs-border-color'),
			borderStrong: token('--bs-secondary-color'),
			textPrimary: token('--bs-body-color'),
			textSecondary: token('--bs-secondary-color'),
			textMuted: token('--bs-tertiary-color'),
			surface: token('--bs-body-bg'),
			warning: token('--bs-warning'),
		};
	}

	function measure(): void {
		if (labelColumn === null) return;
		const head = labelColumn.querySelector<HTMLElement>('[data-timeline-head]');
		const row = labelColumn.querySelector<HTMLElement>('[data-timeline-row]');
		if (head !== null) headerHeight = head.getBoundingClientRect().height;
		if (row !== null) rowHeight = row.getBoundingClientRect().height;
	}

	onMount(() => {
		const updateTheme = () => {
			themeName = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
			tokens = readTokens();
			reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		};
		updateTheme();
		const unsubscribe = resolvedTheme.subscribe(updateTheme);
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		motion.addEventListener('change', updateTheme);

		const observer = new ResizeObserver(measure);
		if (labelColumn !== null) observer.observe(labelColumn);
		measure();

		return () => {
			unsubscribe();
			motion.removeEventListener('change', updateTheme);
			observer.disconnect();
		};
	});

	function onChartClick(event: ECMouseEvent): void {
		const data = event.data as { rowKey?: string } | undefined;
		if (data?.rowKey === undefined) return;
		const row = datedRows.find((candidate) => rowKey(candidate) === data.rowKey);
		if (row !== undefined) void goto(milestonePath(row.repo, row.number));
	}
</script>

{#if empty}
	<EmptyState title={emptyTitle} description={emptyDescription}>
		{#snippet action()}
			<Button color="outline-secondary" href="/milestones">
				<i class="bi bi-bar-chart-steps me-1" aria-hidden="true"></i>
				View Milestones
			</Button>
		{/snippet}
	</EmptyState>
{:else}
	{#if datedRows.length > 0 && timelineWindow !== null}
		<div class="timeline-scroll" data-testid="timeline-chart">
			<div class="timeline-grid">
				<div class="timeline-labels" bind:this={labelColumn}>
					<div
						class="d-flex align-items-center px-3 border-bottom small text-body-secondary"
						data-timeline-head
						style="height: {headerHeight}px"
					>
						Milestone
					</div>
					{#each datedRows as row (rowKey(row))}
						<a
							class="timeline-row d-flex flex-column justify-content-center gap-1 px-3 border-bottom text-reset text-decoration-none"
							data-timeline-row
							href={milestonePath(row.repo, row.number)}
							title={titleOf(row)}
						>
							<span class="d-flex min-w-0 flex-wrap align-items-center column-gap-2 row-gap-1">
								<span class="min-w-0 text-truncate small text-body">
									{titleOf(row)}
								</span>
								{#if isOverdue(row, now)}
									<span class="d-inline-flex align-items-center gap-1 small text-nowrap text-danger">
										<i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
										Overdue
									</span>
								{:else if isAfterDue(row)}
									<span class="d-inline-flex align-items-center gap-1 small text-nowrap text-warning-emphasis">
										<i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
										After due
									</span>
								{:else if row.startOn === null}
									<span class="d-inline-flex align-items-center gap-1 small text-nowrap text-body-tertiary">
										<i class="bi bi-circle" aria-hidden="true"></i>
										No start
									</span>
								{/if}
							</span>
							<span
								class="d-flex min-w-0 flex-wrap align-items-center column-gap-2 row-gap-1 small text-body-secondary"
							>
								<span class="font-monospace min-w-0 text-truncate d-none d-md-inline">
									{timelineRef(row.repo, row.number, repoShortcodes)}
								</span>
								<span class="text-nowrap">Due {formatDay(row.dueOn)}</span>
								<span class="text-nowrap">
									{progressText(row)}
								</span>
							</span>
						</a>
					{/each}
				</div>

				<div class="timeline-plot" style="height: {chartHeight}px">
					<Chart
						{init}
						{options}
						theme={themeName}
						role="img"
						aria-label={`Gantt chart of ${datedRows.length} open milestones, their planned windows, closed progress and open child issues.`}
						onclick={onChartClick}
					/>
				</div>
			</div>
		</div>

		<div
			class="d-flex flex-wrap align-items-center column-gap-4 row-gap-2 border-top mt-3 pt-2 small text-body-secondary"
			aria-label="Chart legend"
		>
			<span class="d-inline-flex align-items-center gap-2 text-nowrap">
				<span class="timeline-legend-planned" aria-hidden="true"></span>
				Planned window
			</span>
			<span class="d-inline-flex align-items-center gap-2 text-nowrap">
				<span class="timeline-legend-closed" aria-hidden="true"></span>
				Closed work
			</span>
			<span class="d-inline-flex align-items-center gap-2 text-nowrap">
				<span class="timeline-legend-marker" aria-hidden="true"></span>
				Open issues
			</span>
			<span class="d-inline-flex align-items-center gap-2 text-nowrap">
				<span class="timeline-legend-nostart" aria-hidden="true"></span>
				No start
			</span>
			<span class="d-inline-flex align-items-center gap-2 text-nowrap">
				<span class="timeline-legend-today" aria-hidden="true"></span>
				Today
			</span>
			{#if hasAfterDue}
				<span class="d-inline-flex align-items-center gap-2 text-nowrap">
					<span class="timeline-legend-after" aria-hidden="true"></span>
					After due
				</span>
			{/if}
		</div>
	{/if}

	{#if undatedRows.length > 0}
		<section class="mt-4" data-testid="timeline-undated">
			<div class="d-flex flex-wrap align-items-baseline justify-content-between column-gap-4 row-gap-1 mb-2">
				<h2 class="small text-body-secondary fw-normal mb-0">No due date</h2>
				<p class="small text-body-secondary mb-0">
					Not plotted until a milestone has a due date.
				</p>
			</div>
			<Table hover responsive size="sm" class="align-middle funnel-table">
				<thead class="table-light small text-body-secondary">
					<tr>
						<th scope="col" class="text-body-secondary">Milestone</th>
						<th scope="col" class="text-body-secondary">Repository</th>
						<th scope="col" class="text-body-secondary text-end">Progress</th>
						<th scope="col" class="text-body-secondary">Start</th>
						<th scope="col" class="text-body-secondary">Due</th>
					</tr>
				</thead>
				<tbody>
					{#each undatedRows as row (rowKey(row))}
						<tr>
							<td class="min-w-0">
								<a
									class="link-primary link-underline-opacity-0 link-underline-opacity-100-hover d-block text-truncate"
									href={milestonePath(row.repo, row.number)}
								>
									{titleOf(row)}
								</a>
							</td>
							<td class="text-nowrap text-body-secondary">
								{timelineRef(row.repo, row.number, repoShortcodes)}
							</td>
							<td class="text-end text-nowrap">
								{progressText(row)}
							</td>
							<td class="text-nowrap">
								{row.startOn === null ? '—' : formatDay(row.startOn)}
							</td>
							<td class="text-nowrap text-body-secondary">No due date</td>
						</tr>
					{/each}
				</tbody>
			</Table>
		</section>
	{/if}
{/if}

<style>
	.timeline-scroll {
		overflow-x: auto;
	}

	.timeline-grid {
		display: flex;
		min-width: calc(var(--funnel-timeline-label) + var(--funnel-timeline-chart-min));
		align-items: stretch;
	}

	.timeline-labels {
		position: sticky;
		left: 0;
		z-index: 2;
		width: var(--funnel-timeline-label);
		flex: none;
		background: var(--bs-body-bg);
		border-right: 1px solid var(--bs-border-color);
	}

	.timeline-row {
		height: var(--funnel-timeline-row);
		overflow: hidden;
	}

	.timeline-row:focus-visible {
		outline: 2px solid var(--bs-primary);
		outline-offset: -2px;
	}

	@media (hover: hover) and (pointer: fine) {
		.timeline-row:hover {
			background: var(--bs-tertiary-bg);
		}
	}

	.timeline-plot {
		min-width: var(--funnel-timeline-chart-min);
		flex: 1 1 auto;
	}

	.timeline-legend-planned {
		width: 2px;
		height: 0.75rem;
		border: 1px solid var(--funnel-chart-1);
		background: color-mix(in srgb, var(--funnel-chart-1) 18%, transparent);
	}

	.timeline-legend-closed {
		width: 2px;
		height: 0.75rem;
		background: var(--funnel-chart-2);
	}

	.timeline-legend-marker {
		width: 1px;
		height: 1rem;
		background: var(--funnel-chart-3);
	}

	.timeline-legend-nostart {
		width: 0.5rem;
		height: 1rem;
		background: var(--bs-tertiary-color);
	}

	.timeline-legend-today {
		width: 1px;
		height: 1rem;
		background: var(--bs-secondary-color);
	}

	.timeline-legend-after {
		width: 0.5rem;
		height: 1rem;
		background: var(--bs-warning);
	}
</style>
