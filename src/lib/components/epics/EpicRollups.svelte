<script lang="ts">
	import { barPercent, formatMinutes } from '#lib/planning';
	import type { EpicRollup } from '#lib/server/epics/queries';
	import ProgressBar from './ProgressBar.svelte';

	/**
	 * Progress and time totals shared by the list and the detail header. The
	 * numbers come from the same calculators the Inspector uses, so an epic's
	 * totals always match the sum of its resolved children.
	 *
	 * Four unboxed stats separated by 1 px rules — no cards, no shadows.
	 */
	interface Props {
		summary: EpicRollup;
	}

	let { summary }: Props = $props();

	const percent = $derived(barPercent(summary.closedChildCount, summary.childCount));
</script>

<div class="row row-cols-2 row-cols-lg-4 g-0" data-testid="epic-rollups">
	<div class="col">
		<section class="rollup d-flex flex-column gap-1" aria-label="Progress">
			<span class="small text-body-secondary">Progress</span>
			<span class="d-flex align-items-center gap-2">
				<span class="fs-5 fw-semibold num">
					{summary.closedChildCount} / {summary.childCount}
				</span>
				<ProgressBar value={percent} />
			</span>
			<span class="small text-body-secondary">closed</span>
		</section>
	</div>

	<div class="col">
		<section class="rollup d-flex flex-column gap-1" aria-label="Estimate">
			<span class="small text-body-secondary">Estimate</span>
			<span class="fs-5 fw-semibold num">
				{formatMinutes(summary.estimateMinutes)}
			</span>
		</section>
	</div>

	<div class="col">
		<section class="rollup d-flex flex-column gap-1" aria-label="Actual time">
			<span class="small text-body-secondary">Actual</span>
			<span class="fs-5 fw-semibold num">
				{formatMinutes(summary.actualMinutes)}
			</span>
		</section>
	</div>

	<div class="col">
		<section class="rollup d-flex flex-column gap-1" aria-label="Delay time">
			<span class="small text-body-secondary">Delay</span>
			<span class="fs-5 fw-semibold num">
				{formatMinutes(summary.delayMinutes)}
			</span>
		</section>
	</div>
</div>

<style>
	.rollup {
		margin-top: 1rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--bs-border-color);
	}

	.num {
		font-variant-numeric: tabular-nums;
	}

	@media (min-width: 992px) {
		.rollup {
			height: 100%;
			margin-top: 0;
			padding-top: 0;
			padding-inline-start: 1rem;
			border-top: 0;
			border-inline-start: 1px solid var(--bs-border-color);
		}

		.col:first-child .rollup {
			padding-inline-start: 0;
			border-inline-start: 0;
		}
	}
</style>
