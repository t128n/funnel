<script lang="ts">
	import { untrack } from 'svelte';
	import SignalHighIcon from '@lucide/svelte/icons/signal-high';
	import SignalLowIcon from '@lucide/svelte/icons/signal-low';
	import SignalMediumIcon from '@lucide/svelte/icons/signal-medium';
	import { matrixCellValue } from '#lib/matrix';
	import {
		IMPACT_SCALE,
		URGENCY_SCALE,
		scaleLevel,
		type Priority,
		type ScaleLevel
	} from '#lib/priority';
	import { cn } from '#lib/utils';
	import { moveMatrixCell, type MatrixGridCell } from './matrix-grid';

	/**
	 * The 3×3 impact × urgency matrix. A cell is a selection control, not a
	 * data table: arrow keys move a roving focus, Enter/Space selects, and the
	 * selected cell carries both `aria-selected` and a primary leading bar.
	 * Cells contain only the derived priority and the scoped issue count.
	 */
	interface Props {
		rows: MatrixGridCell[][];
		selected: { impact: number; urgency: number };
		onselect: (impact: number, urgency: number) => void;
	}

	let { rows, selected, onselect }: Props = $props();

	const TONE_CLASS: Record<Priority, string> = {
		P1: 'text-error',
		P2: 'text-warning',
		P3: 'text-fg-secondary'
	};

	const TONE_ICON = {
		P1: SignalHighIcon,
		P2: SignalMediumIcon,
		P3: SignalLowIcon
	} as const;

	const impactScale = IMPACT_SCALE;
	const urgencyScale = URGENCY_SCALE;

	let gridEl = $state<HTMLDivElement | null>(null);
	let focusedIndex = $state(
		untrack(() => indexOf(selected.impact, selected.urgency))
	);

	function levelName<T extends number>(
		scale: readonly ScaleLevel<T>[],
		value: number
	): string {
		return scaleLevel(scale, value)?.name ?? 'Unknown';
	}

	function indexOf(impact: number, urgency: number): number {
		return (impact - 1) * 3 + (urgency - 1);
	}

	const selectedIndex = $derived(indexOf(selected.impact, selected.urgency));

	/** Keep the roving tab stop on the selected cell. */
	$effect(() => {
		focusedIndex = selectedIndex;
	});

	function focusCell(index: number): void {
		gridEl
			?.querySelectorAll<HTMLElement>('[data-matrix-cell-button]')
			?.[index]?.focus();
	}

	function onKeydown(event: KeyboardEvent): void {
		const target = event.target;
		if (
			!(target instanceof HTMLElement) ||
			!target.matches('[data-matrix-cell-button]')
		) {
			return;
		}

		const next = moveMatrixCell(
			Number(target.dataset.impact),
			Number(target.dataset.urgency),
			event.key
		);
		if (next === null) return;

		event.preventDefault();
		focusedIndex = indexOf(next.impact, next.urgency);
		focusCell(focusedIndex);
	}

	function select(impact: number, urgency: number): void {
		focusedIndex = indexOf(impact, urgency);
		onselect(impact, urgency);
	}

	function cellLabel(cell: MatrixGridCell): string {
		const impact = levelName(impactScale, cell.impact);
		const urgency = levelName(urgencyScale, cell.urgency);
		const issues = `${cell.total} ${cell.total === 1 ? 'issue' : 'issues'}`;
		return `${impact} impact, ${urgency} urgency, ${cell.priority} ${cell.name}, ${issues}`;
	}
</script>

<div class="min-w-0" data-testid="matrix-grid">
	<!-- The column axis sits above the level names so each cell can stay compact. -->
	<div class="matrix-columns text-caption text-fg-secondary" aria-hidden="true">
		<span></span>
		<span class="col-span-3 text-center">Urgency →</span>
	</div>

	<div
		class="matrix-columns matrix-grid mt-1"
		role="grid"
		aria-label="Impact by urgency priority matrix"
		aria-rowcount={4}
		aria-colcount={4}
		tabindex="-1"
		bind:this={gridEl}
		onkeydown={onKeydown}
	>
		<div role="row" class="contents">
			<div role="columnheader" class="matrix-axis-heading" aria-label="Impact">
				Impact ↓
			</div>
			{#each rows[0] as cell (cell.urgency)}
				<div
					role="columnheader"
					class="matrix-column-heading"
					aria-label={`${levelName(urgencyScale, cell.urgency)} urgency`}
				>
					{levelName(urgencyScale, cell.urgency)}
				</div>
			{/each}
		</div>

		{#each rows as row (row[0].impact)}
			<div role="row" class="contents">
				<div
					role="rowheader"
					class="matrix-row-heading"
					aria-label={`${levelName(impactScale, row[0].impact)} impact`}
				>
					{levelName(impactScale, row[0].impact)}
				</div>
				{#each row as cell (cell.urgency)}
					{@const Icon = TONE_ICON[cell.priority]}
					<div
						role="gridcell"
						data-matrix-cell-button
						data-matrix-cell={matrixCellValue(cell.impact, cell.urgency)}
						data-impact={cell.impact}
						data-urgency={cell.urgency}
						tabindex={indexOf(cell.impact, cell.urgency) === focusedIndex ? 0 : -1}
						aria-selected={cell.impact === selected.impact &&
							cell.urgency === selected.urgency}
						aria-label={cellLabel(cell)}
						class="matrix-cell"
						class:is-empty={cell.total === 0}
						onclick={() => select(cell.impact, cell.urgency)}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								select(cell.impact, cell.urgency);
							}
						}}
					>
						<span
							class="matrix-count tabular-nums"
							class:is-long={cell.total >= 1000}
							class:is-longer={cell.total >= 10000}
						>
							{cell.total}
						</span>
						<span class={cn('matrix-priority', TONE_CLASS[cell.priority])}>
							<Icon class="size-3.5 shrink-0" aria-hidden="true" />
							<span aria-hidden="true">{cell.priority}</span>
						</span>
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	.matrix-columns {
		display: grid;
		grid-template-columns: var(--layout-matrix-axis) repeat(3, minmax(0, 1fr));
	}

	.matrix-axis-heading,
	.matrix-column-heading {
		display: flex;
		align-items: end;
		min-height: var(--size-row-compact);
		padding: var(--space-1) var(--space-3);
		border-bottom: 1px solid var(--color-border-subtle);
		background: var(--color-surface-2);
		color: var(--color-text-secondary);
		font-size: var(--font-size-caption);
		font-weight: var(--font-weight-semibold);
		line-height: var(--font-leading-caption);
	}

	.matrix-column-heading {
		border-left: 1px solid var(--color-border-subtle);
	}

	.matrix-row-heading {
		display: flex;
		align-items: center;
		min-height: var(--size-matrix-cell);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-border-subtle);
		color: var(--color-text-primary);
		font-size: var(--font-size-body);
		font-weight: var(--font-weight-semibold);
		line-height: var(--font-leading-interface);
	}

	.matrix-cell {
		display: flex;
		min-height: var(--size-matrix-cell);
		cursor: pointer;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-border-subtle);
		border-left: 1px solid var(--color-border-subtle);
		background: var(--color-canvas);
		color: var(--color-text-primary);
		outline: none;
	}

	.matrix-cell:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	.matrix-cell[aria-selected='true'] {
		box-shadow: inset 2px 0 0 0 var(--color-primary);
	}

	.matrix-count {
		font-size: var(--font-size-heading-sm);
		font-weight: var(--font-weight-semibold);
		line-height: var(--font-leading-none);
		overflow-wrap: anywhere;
	}

	.matrix-count.is-long {
		font-size: var(--font-size-body);
		line-height: var(--font-leading-caption);
	}

	.matrix-count.is-longer {
		font-size: var(--font-size-caption);
		line-height: var(--font-leading-caption);
	}

	.matrix-priority {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--font-size-caption);
		font-weight: var(--font-weight-semibold);
		line-height: var(--font-leading-caption);
	}

	.matrix-cell.is-empty .matrix-count,
	.matrix-cell.is-empty .matrix-priority {
		color: var(--color-text-muted);
	}

	@media (hover: hover) and (pointer: fine) {
		.matrix-cell:hover {
			background: var(--color-surface);
		}
	}
</style>
