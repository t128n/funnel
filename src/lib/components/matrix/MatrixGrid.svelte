<script lang="ts">
	import CircleIcon from '@lucide/svelte/icons/circle';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import SignalHighIcon from '@lucide/svelte/icons/signal-high';
	import SignalLowIcon from '@lucide/svelte/icons/signal-low';
	import SignalMediumIcon from '@lucide/svelte/icons/signal-medium';
	import {
		IMPACT_SCALE,
		MATRIX_IMPACT_VALUES,
		MATRIX_URGENCY_VALUES,
		URGENCY_SCALE,
		scaleLevel,
		type MatrixCellTone
	} from '#lib/priority';
	import { issuePath } from '#lib/issue-url';
	import { cn } from '#lib/utils';
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
		p1: 'text-error',
		p2: 'text-warning',
		p3: 'text-fg-secondary',
		partial: 'text-fg-secondary',
		none: 'text-fg-muted'
	};

	const TONE_ICON = {
		p1: SignalHighIcon,
		p2: SignalMediumIcon,
		p3: SignalLowIcon,
		partial: CircleDashedIcon,
		none: CircleIcon
	} as const;

	/** `data-matrix-cell` identity, unambiguous across `null` axes. */
	function dataKey(cell: MatrixGridCell): string {
		return `${cell.impact ?? 'na'}-${cell.urgency ?? 'na'}`;
	}

	function title(issue: MatrixGridCell['issues'][number]): string {
		return issue.title.trim() || 'Untitled';
	}
</script>

<div class="p-3" data-testid="matrix-grid">
	<div class="overflow-x-auto">
		<table class="table-fixed w-full min-w-[var(--layout-table-min)] border-collapse text-body">
			<caption class="sr-only">Impact by urgency issue matrix</caption>
			<colgroup>
				<col class="w-44" />
				<col />
				<col />
				<col />
				<col />
			</colgroup>
			<thead>
				<tr>
					<th
						scope="col"
						class="sticky start-0 z-10 border border-border-subtle bg-surface-2 p-2 text-left align-bottom font-semibold"
					>
						<div class="text-caption text-fg-secondary">Impact ↓</div>
						<div class="text-caption text-fg-secondary">How much does it hurt?</div>
						<div class="mt-2 text-caption text-fg-secondary">Urgency →</div>
						<div class="text-caption text-fg-secondary">How soon must it be fixed?</div>
					</th>
					{#each urgencyLabels as label (label)}
						<th
							scope="col"
							class="border border-border-subtle bg-surface-2 p-2 text-left align-bottom font-semibold"
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
							class="sticky start-0 z-10 border border-border-subtle bg-surface p-2 text-left align-top font-semibold whitespace-nowrap"
						>
							{impactLabels[rowIndex]}
						</th>
						{#each row as cell (dataKey(cell))}
							{@const Icon = TONE_ICON[cell.meta.tone]}
							<td
								data-matrix-cell={dataKey(cell)}
								class="min-w-0 border border-border-subtle p-0 align-top"
							>
								<div
									class="flex items-baseline justify-between gap-2 border-b border-border-subtle px-2 pt-1.5 pb-1"
								>
									<span
										class={cn(
											'flex min-w-0 items-center gap-1.5 text-body font-semibold',
											TONE_CLASS[cell.meta.tone]
										)}
									>
										<Icon class="size-4 shrink-0" aria-hidden="true" />
										<span class="truncate">{cell.meta.label}</span>
									</span>
									<span class="shrink-0 text-body text-fg-secondary tabular-nums">
										{cell.total}
									</span>
								</div>

								{#if cell.total === 0}
									<p class="px-2 py-1.5 text-body text-fg-muted">—</p>
								{:else}
									<ul class="my-1">
										{#each cell.issues.slice(0, 4) as issue (`${issue.repoId}:${issue.number}`)}
											<li>
												<a
													href={issuePath('matrix', issue.repo, issue.number)}
													class="flex min-w-0 items-baseline gap-1.5 px-2 py-0.5 text-caption hover:bg-surface-2"
													title={`${issue.repo}#${issue.number} ${title(issue)}`}
												>
													<span class="mono shrink-0 text-fg-secondary">
														{issue.repo}#{issue.number}
													</span>
													<span class="min-w-0 truncate text-fg">{title(issue)}</span>
												</a>
											</li>
										{/each}
										{#if cell.total > Math.min(4, cell.issues.length)}
											<li class="px-2 py-0.5 text-caption text-fg-secondary tabular-nums">
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
		</table>
	</div>
</div>
