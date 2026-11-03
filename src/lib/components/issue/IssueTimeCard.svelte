<script lang="ts">
	import type { IssueTime } from '#lib/server/actuals/time';
	import { timeCardRows } from './inspector-format';

	/** Estimate, actual, delay and variance for one issue (SPEC §5). */
	interface Props {
		time: IssueTime;
	}

	let { time }: Props = $props();

	const rows = $derived(timeCardRows(time));

	const toneClass = {
		neutral: 'text-body',
		positive: 'text-success',
		negative: 'text-danger'
	} as const;
</script>

<section class="d-flex flex-column gap-2" aria-label="Time">
	<div class="d-flex align-items-baseline justify-content-between gap-3 border-top pt-3">
		<h2 class="h5 fw-semibold mb-0">Time</h2>
		{#if time.delayCount > 0}
			<span class="small text-body-secondary time-number">
				{time.delayCount} {time.delayCount === 1 ? 'delay' : 'delays'}
			</span>
		{/if}
	</div>
	<dl class="row row-cols-2 row-cols-sm-4 g-3 mb-0">
		{#each rows as row (row.key)}
			<div class="col d-flex min-w-0 flex-column gap-1">
				<dt class="small fw-normal text-body-secondary">{row.label}</dt>
				<dd class="mb-0 text-truncate fw-semibold {toneClass[row.tone]} time-number">
					{row.value}
				</dd>
			</div>
		{/each}
	</dl>
</section>

<style>
	.time-number {
		font-variant-numeric: tabular-nums;
	}
</style>
