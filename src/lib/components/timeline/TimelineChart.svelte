<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ChartGanttIcon from '@lucide/svelte/icons/chart-gantt';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { Chart, type ECMouseEvent } from 'svelte-echarts';
	import { CustomChart, ScatterChart } from 'echarts/charts';
	import { AriaComponent, GridComponent, TooltipComponent } from 'echarts/components';
	import { init, use } from 'echarts/core';
	import { CanvasRenderer } from 'echarts/renderers';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import { Button } from '#lib/components/ui/button';
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

	/** Read the active t128n tokens; the canvas must use the same values as CSS. */
	function readTokens(): TimelineChartTokens {
		const style = getComputedStyle(document.documentElement);
		const rootPx = Number.parseFloat(style.fontSize) || 16;
		const token = (name: string): string => style.getPropertyValue(name).trim();
		return {
			fontSans: token('--font-sans') || 'sans-serif',
			fontMono: token('--font-mono') || 'monospace',
			captionPx: rootPx * 0.75,
			bodyPx: rootPx * 0.875,
			monoPx: rootPx * 0.8125,
			chart1: token('--color-chart-1'),
			chart2: token('--color-chart-2'),
			chart3: token('--color-chart-3'),
			borderSubtle: token('--color-border-subtle'),
			borderStrong: token('--color-border-strong'),
			textPrimary: token('--color-text-primary'),
			textSecondary: token('--color-text-secondary'),
			textMuted: token('--color-text-muted'),
			surface: token('--color-surface'),
			warning: token('--color-warning'),
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
			<Button variant="outline" href="/milestones">
				<ChartGanttIcon aria-hidden="true" />
				View Milestones
			</Button>
		{/snippet}
	</EmptyState>
{:else}
	{#if datedRows.length > 0 && timelineWindow !== null}
		<div class="timeline-scroll" data-testid="timeline-chart">
			<div class="timeline-grid">
				<div class="timeline-labels" bind:this={labelColumn}>
					<div class="timeline-label-head" data-timeline-head style="height: {headerHeight}px">
						<span class="text-caption font-semibold text-fg-secondary">Milestone</span>
					</div>
					{#each datedRows as row (rowKey(row))}
						<a
							class="timeline-row"
							data-timeline-row
							href={milestonePath(row.repo, row.number)}
							title={titleOf(row)}
						>
							<span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
								<span class="min-w-0 truncate text-body font-semibold text-fg">
									{titleOf(row)}
								</span>
								{#if isOverdue(row, now)}
									<span class="timeline-flag text-error">
										<TriangleAlertIcon class="size-3" aria-hidden="true" />
										Overdue
									</span>
								{:else if isAfterDue(row)}
									<span class="timeline-flag text-warning">
										<TriangleAlertIcon class="size-3" aria-hidden="true" />
										After due
									</span>
								{:else if row.startOn === null}
									<span class="timeline-flag text-fg-muted">
										<CircleDashedIcon class="size-3" aria-hidden="true" />
										No start
									</span>
								{/if}
							</span>
							<span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-fg-secondary">
								<span class="timeline-meta-ref mono min-w-0 truncate max-md:hidden">
									{timelineRef(row.repo, row.number, repoShortcodes)}
								</span>
								<span class="tabular-nums whitespace-nowrap">Due {formatDay(row.dueOn)}</span>
								<span class="tabular-nums whitespace-nowrap">
									{row.closedIssues}/{row.closedIssues + row.openIssues}{' '}<span
										class="max-md:hidden"
									>
										closed
									</span>
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

		<div class="timeline-legend" aria-label="Chart legend">
			<span class="timeline-legend-item">
				<span class="timeline-legend-planned" aria-hidden="true"></span>
				Planned window
			</span>
			<span class="timeline-legend-item">
				<span class="timeline-legend-closed" aria-hidden="true"></span>
				Closed work
			</span>
			<span class="timeline-legend-item">
				<span class="timeline-legend-marker" aria-hidden="true"></span>
				Open issues
			</span>
			<span class="timeline-legend-item">
				<span class="timeline-legend-nostart" aria-hidden="true"></span>
				No start
			</span>
			<span class="timeline-legend-item">
				<span class="timeline-legend-today" aria-hidden="true"></span>
				Today
			</span>
			{#if hasAfterDue}
				<span class="timeline-legend-item">
					<span class="timeline-legend-after" aria-hidden="true"></span>
					After due
				</span>
			{/if}
		</div>
	{/if}

	{#if undatedRows.length > 0}
		<section class="mt-6 flex flex-col gap-2" data-testid="timeline-undated">
			<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 class="text-body font-semibold text-fg">No due date</h2>
				<p class="text-caption text-fg-secondary">
					Not plotted until a milestone has a due date.
				</p>
			</div>
			<div class="overflow-x-auto">
				<table class="data-table">
					<thead>
						<tr>
							<th>Milestone</th>
							<th>Repository</th>
							<th class="text-end">Progress</th>
							<th>Start</th>
							<th>Due</th>
						</tr>
					</thead>
					<tbody>
						{#each undatedRows as row (rowKey(row))}
							<tr>
								<td class="min-w-0">
									<a class="link block truncate" href={milestonePath(row.repo, row.number)}>
										{titleOf(row)}
									</a>
								</td>
								<td class="mono whitespace-nowrap text-fg-secondary">
									{timelineRef(row.repo, row.number, repoShortcodes)}
								</td>
								<td class="tabular-nums whitespace-nowrap text-end">
									{progressText(row)}
								</td>
								<td class="tabular-nums whitespace-nowrap">
									{row.startOn === null ? '—' : formatDay(row.startOn)}
								</td>
								<td class="whitespace-nowrap text-fg-secondary">No due date</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
{/if}

<style>
	.timeline-scroll {
		overflow-x: auto;
	}

	.timeline-grid {
		display: flex;
		min-width: var(--layout-timeline-min);
		align-items: stretch;
	}

	.timeline-labels {
		position: sticky;
		left: 0;
		z-index: var(--z-sticky);
		width: var(--layout-timeline-label);
		flex: none;
		background: var(--color-canvas);
		border-right: 1px solid var(--color-border-subtle);
	}

	.timeline-label-head {
		display: flex;
		align-items: center;
		padding: 0 var(--space-3);
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.timeline-row {
		display: flex;
		height: var(--layout-timeline-row);
		overflow: hidden;
		flex-direction: column;
		justify-content: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		border-bottom: 1px solid var(--color-border-subtle);
		color: inherit;
		text-decoration: none;
	}

	.timeline-row:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	@media (hover: hover) and (pointer: fine) {
		.timeline-row:hover {
			background: var(--color-surface);
		}
	}

	.timeline-flag {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--font-size-caption);
		white-space: nowrap;
	}

	.timeline-plot {
		min-width: var(--layout-timeline-chart-min);
		flex: 1 1 auto;
	}

	.timeline-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-4);
		padding-top: var(--space-3);
		font-size: var(--font-size-caption);
		color: var(--color-text-secondary);
	}

	.timeline-legend-item {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		white-space: nowrap;
	}

	.timeline-legend-planned {
		width: var(--size-divider);
		height: var(--size-timeline-bar);
		border: 1px solid var(--color-chart-1);
		background: color-mix(in srgb, var(--color-chart-1) 18%, transparent);
	}

	.timeline-legend-closed {
		width: var(--size-divider);
		height: var(--size-timeline-bar);
		background: var(--color-chart-2);
	}

	.timeline-legend-marker {
		width: 1px;
		height: var(--size-timeline-marker);
		background: var(--color-chart-3);
	}

	.timeline-legend-nostart {
		width: var(--size-timeline-tick);
		height: var(--size-timeline-marker);
		background: var(--color-text-muted);
	}

	.timeline-legend-today {
		width: 1px;
		height: var(--size-timeline-marker);
		background: var(--color-border-strong);
	}

	.timeline-legend-after {
		width: var(--size-timeline-tick);
		height: var(--size-timeline-marker);
		background: var(--color-warning);
	}

</style>
