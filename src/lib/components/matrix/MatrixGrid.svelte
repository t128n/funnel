<script lang="ts">
	import { Table } from '@sveltestrap/sveltestrap';
	import {
		IMPACT_SCALE,
		MATRIX_IMPACT_VALUES,
		MATRIX_URGENCY_VALUES,
		URGENCY_SCALE,
		scaleLevel,
		type MatrixCellTone
	} from '#lib/priority';
	import { issuePath } from '#lib/issue-url';
	import type { MatrixGridCell } from './matrix-grid';

	/**
	 * The 4×4 impact × urgency matrix table. Purely presentational: the caller
	 * projects the board with `matrixGrid` and passes the rows in. Header cells
	 * label the two axes; each body cell renders its priority token and name,
	 * the SQL total, and up to four preview links ordered by priority rank then
	 * most recently updated.
	 */
	interface Props {
		rows: MatrixGridCell[][];
	}

	let { rows }: Props = $props();

	/** Header labels: assessed levels then Not assessed, in the fixed order. */
	const impactLabels = MATRIX_IMPACT_VALUES.map((value) =>
		value === null ? 'Not assessed' : `${value} · ${scaleLevel(IMPACT_SCALE, value)?.name}`
	);
	const urgencyLabels = MATRIX_URGENCY_VALUES.map((value) =>
		value === null ? 'Not assessed' : `${value} · ${scaleLevel(URGENCY_SCALE, value)?.name}`
	);

	const TONE_CLASS: Record<MatrixCellTone, string> = {
		p1: 'text-danger',
		p2: 'text-warning-emphasis',
		p3: 'text-body-secondary',
		partial: 'text-body-secondary',
		none: 'text-body-tertiary'
	};

	const TONE_ICON: Record<MatrixCellTone, string> = {
		p1: 'bi-reception-4',
		p2: 'bi-reception-3',
		p3: 'bi-reception-1',
		partial: 'bi-dash-circle-dotted',
		none: 'bi-circle'
	};

	/** `data-matrix-cell` identity, unambiguous across `null` axes. */
	function dataKey(cell: MatrixGridCell): string {
		return `${cell.impact ?? 'na'}-${cell.urgency ?? 'na'}`;
	}

	function title(issue: MatrixGridCell['issues'][number]): string {
		return issue.title.trim() || 'Untitled';
	}
</script>

<div class="py-2" data-testid="matrix-grid">
	<div class="overflow-x-auto">
		<Table bordered size="sm" class="matrix-table align-middle">
			<caption class="visually-hidden">Impact by urgency issue matrix</caption>
			<colgroup>
				<col class="matrix-impact-column" />
				<col />
				<col />
				<col />
				<col />
			</colgroup>
			<thead>
				<tr>
					<th scope="col" class="matrix-sticky bg-body text-start align-bottom">
						<div class="small text-body-secondary">Impact ↓</div>
						<div class="small text-body-secondary">How much does it hurt?</div>
						<div class="mt-1 small text-body-secondary">Urgency →</div>
						<div class="small text-body-secondary">How soon must it be fixed?</div>
					</th>
					{#each urgencyLabels as label (label)}
						<th scope="col" class="text-start align-bottom">
							{label}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row, rowIndex (impactLabels[rowIndex])}
					<tr>
						<th
							scope="row"
							class="matrix-sticky bg-body text-start align-top text-nowrap"
						>
							{impactLabels[rowIndex]}
						</th>
						{#each row as cell (dataKey(cell))}
							<td data-matrix-cell={dataKey(cell)} class="min-w-0 p-0 align-top">
								<div class="d-flex align-items-baseline justify-content-between gap-2 px-2 pt-1">
									<span
										class="d-flex min-w-0 align-items-center gap-1 {TONE_CLASS[
											cell.meta.tone
										]}"
									>
										<i class="bi {TONE_ICON[cell.meta.tone]} flex-shrink-0" aria-hidden="true"></i>
										<span class="text-truncate">{cell.meta.label}</span>
									</span>
									<span class="flex-shrink-0 text-body-secondary tnum">
										{cell.total}
									</span>
								</div>

								{#if cell.total === 0}
									<p class="px-2 pb-1 text-body-tertiary mb-0">—</p>
								{:else}
									<ul class="my-1 ps-0 list-unstyled">
										{#each cell.issues.slice(0, 4) as issue (`${issue.repoId}:${issue.number}`)}
											<li>
												<a
													href={issuePath('issues', issue.repo, issue.number)}
													class="matrix-issue d-flex min-w-0 align-items-baseline gap-2 px-2 py-1 small text-decoration-none"
													title={`${issue.repo}#${issue.number} ${title(issue)}`}
												>
													<span class="font-monospace flex-shrink-0 link-primary">
														{issue.repo}#{issue.number}
													</span>
													<span class="min-w-0 text-truncate text-body">{title(issue)}</span>
												</a>
											</li>
										{/each}
										{#if cell.total > Math.min(4, cell.issues.length)}
											<li class="px-2 py-1 small text-body-secondary tnum">
												+ {cell.total - Math.min(4, cell.issues.length)} more
											</li>
										{/if}
									</ul>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</Table>
	</div>
</div>

<style>
	:global(.matrix-table) {
		table-layout: fixed;
		min-width: var(--funnel-table-min);
		margin-bottom: 0;
	}

	.matrix-impact-column {
		width: 11rem;
	}

	.matrix-sticky {
		position: sticky;
		inset-inline-start: 0;
		z-index: 1;
	}

	.matrix-issue:hover {
		background: var(--bs-tertiary-bg);
	}

	.tnum {
		font-variant-numeric: tabular-nums;
	}
</style>
