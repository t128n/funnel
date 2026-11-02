<script lang="ts">
	import type { IssueTime } from '#lib/server/actuals/time';
	import { cn } from '#lib/utils';
	import { timeCardRows } from './inspector-format';

	/** Estimate, actual, delay and variance for one issue (SPEC §5). */
	interface Props {
		time: IssueTime;
	}

	let { time }: Props = $props();

	const rows = $derived(timeCardRows(time));

	const toneClass = {
		neutral: 'text-fg',
		positive: 'text-success',
		negative: 'text-error'
	} as const;
</script>

<section class="flex flex-col gap-2" aria-label="Time">
	<div class="flex items-baseline justify-between gap-3 border-t border-border-subtle pt-3">
		<h2 class="text-heading-sm font-semibold text-fg">Time</h2>
		{#if time.delayCount > 0}
			<span class="text-caption tabular-nums text-fg-secondary">
				{time.delayCount} {time.delayCount === 1 ? 'delay' : 'delays'}
			</span>
		{/if}
	</div>
	<dl class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
		{#each rows as row (row.key)}
			<div class="flex min-w-0 flex-col gap-0.5">
				<dt class="text-caption text-fg-secondary">{row.label}</dt>
				<dd class={cn('truncate text-body font-semibold tabular-nums', toneClass[row.tone])}>
					{row.value}
				</dd>
			</div>
		{/each}
	</dl>
</section>
