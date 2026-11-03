<script lang="ts">
	import { untrack } from 'svelte';
	import {
		IMPACT_SCALE,
		URGENCY_SCALE,
		scaleLevel,
		type Priority,
		type ScaleLevel
	} from '#lib/priority';
	import { matrixCellValue } from '#lib/matrix';
	import { moveMatrixCell, type MatrixGridCell } from './matrix-grid';

	/**
	 * The 3×3 impact × urgency matrix. A cell is a selection control, not a
	 * data link: arrow keys move a roving focus, Enter/Space selects, and the
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
		P1: 'text-danger',
		P2: 'text-body',
		P3: 'text-secondary'
	};

	const TONE_ICON: Record<Priority, string> = {
		P1: 'bi-reception-4',
		P2: 'bi-reception-2',
		P3: 'bi-reception-1'
	};

	let gridEl = $state<HTMLTableElement | null>(null);
	let focusedIndex = $state(untrack(() => indexOf(selected.impact, selected.urgency)));

	function levelName<T extends number>(scale: readonly ScaleLevel<T>[], value: number): string {
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
		gridEl?.querySelectorAll<HTMLElement>('[data-matrix-cell-button]')?.[index]?.focus();
	}

	function onKeydown(event: KeyboardEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement) || !target.matches('[data-matrix-cell-button]')) return;

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
		const impact = levelName(IMPACT_SCALE, cell.impact);
		const urgency = levelName(URGENCY_SCALE, cell.urgency);
		const issues = `${cell.total} ${cell.total === 1 ? 'issue' : 'issues'}`;
		return `${impact} impact, ${urgency} urgency, ${cell.priority} ${cell.name}, ${issues}`;
	}
</script>

<div class="min-w-0" data-testid="matrix-grid">
	<div class="table-responsive border rounded">
		<table
			bind:this={gridEl}
			class="table table-bordered align-middle matrix-table mb-0"
			role="grid"
			aria-label="Impact by urgency priority matrix"
			aria-rowcount={rows.length + 1}
			aria-colcount={4}
			onkeydown={onKeydown}
		>
			<caption class="visually-hidden">Impact by urgency priority matrix</caption>
			<colgroup>
				<col class="matrix-axis-column" />
				<col />
				<col />
				<col />
			</colgroup>
			<thead>
				<tr>
					<th scope="col" class="matrix-axis bg-body-tertiary text-start align-bottom">
						<span class="small text-body-secondary d-block">Impact ↓</span>
						<span class="small text-body-secondary d-block">Urgency →</span>
					</th>
					{#each rows[0] as cell (cell.urgency)}
						<th
							scope="col"
							class="matrix-axis bg-body-tertiary text-center align-bottom small text-body-secondary"
						>
							{levelName(URGENCY_SCALE, cell.urgency)}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row[0].impact)}
					<tr>
						<th scope="row" class="matrix-row-heading bg-body text-start small fw-semibold text-body">
							{levelName(IMPACT_SCALE, row[0].impact)}
						</th>
						{#each row as cell (cell.urgency)}
							{@const empty = cell.total === 0}
							{@const priorityClass = empty ? 'text-body-tertiary' : TONE_CLASS[cell.priority]}
							<td
								role="gridcell"
								data-matrix-cell-button
								data-matrix-cell={matrixCellValue(cell.impact, cell.urgency)}
								data-impact={cell.impact}
								data-urgency={cell.urgency}
								tabindex={indexOf(cell.impact, cell.urgency) === focusedIndex ? 0 : -1}
								aria-selected={cell.impact === selected.impact &&
									cell.urgency === selected.urgency}
								aria-label={cellLabel(cell)}
								class="matrix-cell p-0"
								onclick={() => select(cell.impact, cell.urgency)}
								onkeydown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										select(cell.impact, cell.urgency);
									}
								}}
							>
								<div class="d-flex flex-column justify-content-between gap-2 p-2 h-100">
									<span class="matrix-count fw-semibold {empty ? 'text-body-tertiary' : ''}">{cell.total}</span>
									<span
										class="matrix-priority d-inline-flex align-items-center gap-1 small fw-semibold {priorityClass}"
									>
										<i class="bi {TONE_ICON[cell.priority]}" aria-hidden="true"></i>
										<span>{cell.priority}</span>
									</span>
								</div>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.matrix-table {
		table-layout: fixed;
		min-width: 30rem;
		margin-bottom: 0;
	}

	.matrix-axis-column {
		width: 8rem;
	}

	.matrix-axis,
	.matrix-row-heading {
		padding: 0.5rem 0.75rem;
	}

	.matrix-cell {
		height: 5.25rem;
		cursor: pointer;
		background: var(--bs-body-bg);
		color: var(--bs-body-color);
		outline: none;
	}

	.matrix-cell:focus-visible {
		outline: 2px solid var(--bs-primary);
		outline-offset: -2px;
	}

	.matrix-cell[aria-selected='true'] {
		background: var(--bs-tertiary-bg);
		box-shadow: inset 3px 0 0 var(--bs-primary);
	}

	.matrix-count {
		font-size: 1.25rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	@media (hover: hover) and (pointer: fine) {
		.matrix-cell:hover {
			background: var(--bs-tertiary-bg);
		}
	}
</style>
