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

<div class="grid grid-cols-2 gap-y-4 lg:grid-cols-4" data-testid="epic-rollups">
	<section
		class="flex flex-col gap-1 border-t border-border-subtle pt-2 lg:border-s lg:border-t-0 lg:ps-4 lg:first:border-s-0 lg:first:ps-0"
		aria-label="Progress"
	>
		<span class="text-caption text-fg-secondary">Progress</span>
		<span class="flex items-center gap-2">
			<span class="text-heading-sm font-semibold leading-heading-sm tabular-nums">
				{summary.closedChildCount} / {summary.childCount}
			</span>
			<ProgressBar value={percent} />
		</span>
		<span class="text-caption text-fg-secondary">closed</span>
	</section>

	<section
		class="flex flex-col gap-1 border-t border-border-subtle pt-2 lg:border-s lg:border-t-0 lg:ps-4 lg:first:border-s-0 lg:first:ps-0"
		aria-label="Estimate"
	>
		<span class="text-caption text-fg-secondary">Estimate</span>
		<span class="text-heading-sm font-semibold leading-heading-sm tabular-nums">
			{formatMinutes(summary.estimateMinutes)}
		</span>
	</section>

	<section
		class="flex flex-col gap-1 border-t border-border-subtle pt-2 lg:border-s lg:border-t-0 lg:ps-4 lg:first:border-s-0 lg:first:ps-0"
		aria-label="Actual time"
	>
		<span class="text-caption text-fg-secondary">Actual</span>
		<span class="text-heading-sm font-semibold leading-heading-sm tabular-nums">
			{formatMinutes(summary.actualMinutes)}
		</span>
	</section>

	<section
		class="flex flex-col gap-1 border-t border-border-subtle pt-2 lg:border-s lg:border-t-0 lg:ps-4 lg:first:border-s-0 lg:first:ps-0"
		aria-label="Delay time"
	>
		<span class="text-caption text-fg-secondary">Delay</span>
		<span class="text-heading-sm font-semibold leading-heading-sm tabular-nums">
			{formatMinutes(summary.delayMinutes)}
		</span>
	</section>
</div>
