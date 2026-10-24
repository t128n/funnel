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
		neutral: 'text-foreground',
		positive: 'text-[var(--syntax-constant)]',
		negative: 'text-destructive'
	} as const;
</script>

<section class="flex flex-col gap-2" aria-label="Time">
	<div class="flex items-center justify-between">
		<h2 class="text-foreground text-sm font-semibold">Time</h2>
		{#if time.delayCount > 0}
			<span class="mono text-muted-foreground text-xs">
				{time.delayCount} {time.delayCount === 1 ? 'delay' : 'delays'}
			</span>
		{/if}
	</div>
	<dl class="border-border grid grid-cols-4 gap-2 rounded-lg border p-3">
		{#each rows as row (row.key)}
			<div class="flex min-w-0 flex-col gap-0.5">
				<dt class="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
					{row.label}
				</dt>
				<dd class={cn('mono truncate text-sm font-medium', toneClass[row.tone])}>
					{row.value}
				</dd>
			</div>
		{/each}
	</dl>
</section>
