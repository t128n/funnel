<script lang="ts">
	import { barPercent, formatMinutes } from '#lib/planning';
	import type { EpicRollup } from '#lib/server/epics/queries';

	/**
	 * Progress and time totals shared by the list and the detail header. The
	 * numbers come from the same calculators the Inspector uses, so an epic's
	 * totals always match the sum of its resolved children.
	 */
	interface Props {
		summary: EpicRollup;
	}

	let { summary }: Props = $props();

	const percent = $derived(barPercent(summary.closedChildCount, summary.childCount));
</script>

<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="epic-rollups">
	<section
		class="border-[color:var(--border)] flex flex-col gap-1.5 rounded border p-3"
		aria-label="Progress"
	>
		<span class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
			Progress
		</span>
		<span class="text-sm font-semibold tabular-nums">
			{summary.closedChildCount}/{summary.childCount} closed
		</span>
		<span class="bg-[var(--muted)] h-1.5 w-full overflow-hidden rounded-full">
			<span
				class="block h-full rounded-full bg-[var(--primary)]"
				style={`width: ${percent}%`}
			></span>
		</span>
	</section>

	<section
		class="border-[color:var(--border)] flex flex-col gap-1 rounded border p-3"
		aria-label="Estimate"
	>
		<span class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
			Estimate
		</span>
		<span class="text-sm font-semibold tabular-nums">{formatMinutes(summary.estimateMinutes)}</span>
	</section>

	<section
		class="border-[color:var(--border)] flex flex-col gap-1 rounded border p-3"
		aria-label="Actual time"
	>
		<span class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
			Actual
		</span>
		<span class="text-sm font-semibold tabular-nums">{formatMinutes(summary.actualMinutes)}</span>
	</section>

	<section
		class="border-[color:var(--border)] flex flex-col gap-1 rounded border p-3"
		aria-label="Delay time"
	>
		<span class="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
			Delay
		</span>
		<span class="text-sm font-semibold tabular-nums">{formatMinutes(summary.delayMinutes)}</span>
	</section>
</div>
