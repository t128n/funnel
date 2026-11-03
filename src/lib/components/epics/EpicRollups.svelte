<script lang="ts">
	import { barPercent, formatMinutes } from '#lib/planning';
	import type { EpicRollup } from '#lib/server/epics/queries';
	import ProgressBar from './ProgressBar.svelte';

	/**
	 * Progress and time totals shared by the list and the detail header. The
	 * numbers come from the same calculators the Inspector uses, so an epic's
	 * totals always match the sum of its resolved children.
	 *
	 * Four compact figures in one ruled line — labels, values, no panels.
	 */
	interface Props {
		summary: EpicRollup;
	}

	let { summary }: Props = $props();

	const percent = $derived(barPercent(summary.closedChildCount, summary.childCount));
</script>

<div
	class="row row-cols-2 row-cols-lg-4 g-0 border-top py-2"
	data-testid="epic-rollups"
>
	<div class="col">
		<section class="d-flex flex-column gap-1 pe-3 py-1" aria-label="Progress">
			<span class="small text-body-secondary">Progress</span>
			<span class="d-flex align-items-center gap-2">
				<span class="font-monospace">
					{summary.closedChildCount} / {summary.childCount}
				</span>
				<ProgressBar value={percent} />
			</span>
		</section>
	</div>

	<div class="col">
		<section class="d-flex flex-column gap-1 pe-3 py-1" aria-label="Estimate">
			<span class="small text-body-secondary">Estimate</span>
			<span class="font-monospace">
				{formatMinutes(summary.estimateMinutes)}
			</span>
		</section>
	</div>

	<div class="col">
		<section class="d-flex flex-column gap-1 pe-3 py-1" aria-label="Actual time">
			<span class="small text-body-secondary">Actual</span>
			<span class="font-monospace">
				{formatMinutes(summary.actualMinutes)}
			</span>
		</section>
	</div>

	<div class="col">
		<section class="d-flex flex-column gap-1 py-1" aria-label="Delay time">
			<span class="small text-body-secondary">Delay</span>
			<span class="font-monospace">
				{formatMinutes(summary.delayMinutes)}
			</span>
		</section>
	</div>
</div>
