<script lang="ts">
	import {
		IMPACT_SCALE,
		MATRIX_IMPACT_VALUES,
		MATRIX_URGENCY_VALUES,
		URGENCY_SCALE,
		scaleLevel,
		type MatrixCellTone,
	} from '#lib/priority';
	import { issuePath } from '#lib/issue-url';
	import { cn } from '#lib/utils';
	import type { MatrixGridCell } from './matrix-grid';

	/**
	 * The 4×4 impact × urgency matrix table. Purely presentational: the caller
	 * projects the board with `matrixGrid` and passes the rows in. Header cells
	 * label the two axes; each body cell renders its meta label, the SQL total,
	 * and up to four preview links ordered by priority rank then most recently
	 * updated.
	 */
	interface Props {
		rows: MatrixGridCell[][];
	}

	let { rows }: Props = $props();

	/** Header labels: assessed levels then Not assessed, in the fixed order. */
	const impactLabels = MATRIX_IMPACT_VALUES.map((value) =>
		value === null ? 'Not assessed' : `${value} · ${scaleLevel(IMPACT_SCALE, value)?.name}`,
	);
	const urgencyLabels = MATRIX_URGENCY_VALUES.map((value) =>
		value === null ? 'Not assessed' : `${value} · ${scaleLevel(URGENCY_SCALE, value)?.name}`,
	);

	const TONE_LABEL: Record<MatrixCellTone, string> = {
		p1: 'text-destructive',
		p2: 'text-warning',
		p3: 'text-muted-foreground',
		partial: 'text-muted-foreground',
		none: 'text-muted-foreground',
	};

	/** Partial cells read as a dashed outline; the rest are solid. */
	function cellClass(tone: MatrixCellTone): string {
		return cn(
			'border border-[color:var(--border)] p-0 align-top min-w-0',
			tone === 'partial' && 'border-dashed',
		);
	}

	/** `data-matrix-cell` identity, unambiguous across `null` axes. */
	function dataKey(cell: MatrixGridCell): string {
		return `${cell.impact ?? 'na'}-${cell.urgency ?? 'na'}`;
	}

	function title(issue: MatrixGridCell['issues'][number]): string {
		return issue.title.trim() || 'Untitled';
	}
</script>

<div class="p-3" data-testid="matrix-grid">
	<table class="min-w-[860px] w-full border-collapse text-sm">
		<thead>
			<tr>
				<th class="border border-[color:var(--border)] bg-muted/40 p-2 text-left align-bottom">
					<div class="text-muted-foreground text-xs font-medium">Impact ↓</div>
					<div class="text-muted-foreground text-[11px]">How much does it hurt?</div>
					<div class="text-muted-foreground mt-2 text-xs font-medium">Urgency →</div>
					<div class="text-muted-foreground text-[11px]">How soon must it be fixed?</div>
				</th>
				{#each urgencyLabels as label (label)}
					<th
						scope="col"
						class="border border-[color:var(--border)] bg-muted/40 p-2 text-left font-medium align-bottom"
					>
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
						class="border border-[color:var(--border)] bg-muted/40 p-2 text-left font-medium whitespace-nowrap align-top"
					>
						{impactLabels[rowIndex]}
					</th>
					{#each row as cell (dataKey(cell))}
						<td data-matrix-cell={dataKey(cell)} class={cellClass(cell.meta.tone)}>
							<div class="flex items-baseline justify-between gap-2 px-2 pt-1.5">
								<span class={cn('font-medium', TONE_LABEL[cell.meta.tone])}>
									{cell.meta.label}
								</span>
								<span class="text-muted-foreground text-xs tabular-nums">{cell.total}</span>
							</div>
							{#if cell.issues.length > 0}
								<ul class="mt-1 mb-1.5">
									{#each cell.issues as issue (`${issue.repoId}:${issue.number}`)}
										<li>
											<a
												href={issuePath('matrix', issue.repo, issue.number)}
												class="hover:bg-accent flex min-w-0 items-baseline gap-1.5 px-2 py-0.5 text-xs"
												title={`${issue.repo}#${issue.number} ${title(issue)}`}
											>
												<span class="mono text-muted-foreground shrink-0">
													{issue.repo}#{issue.number}
												</span>
												<span class="min-w-0 truncate">{title(issue)}</span>
											</a>
										</li>
									{/each}
								</ul>
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
