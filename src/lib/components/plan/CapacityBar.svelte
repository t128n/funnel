<script lang="ts">
	import { barPercent, formatMinutes } from '#lib/planning';
	import { cn } from '#lib/utils';
	import { capacityTone } from './format';

	/**
	 * A compact capacity meter: committed minutes over the plan cap with a
	 * marker at the allocation line. A milestone without a due date has no cap
	 * (`capMinutes: null`), so it renders committed hours without a bar rather
	 * than a misleading empty or full one.
	 */
	interface Props {
		committedMinutes: number;
		capMinutes: number | null;
		/** Where the allocation line sits, as a percentage of the cap. */
		allocationPercent?: number;
		class?: string;
	}

	let {
		committedMinutes,
		capMinutes,
		allocationPercent = 60,
		class: className = ''
	}: Props = $props();

	const tone = $derived(
		capMinutes === null ? 'empty' : capacityTone(committedMinutes, capMinutes)
	);
	const percent = $derived(
		capMinutes === null ? 0 : barPercent(committedMinutes, capMinutes)
	);
	const marker = $derived(Math.min(100, Math.max(0, allocationPercent)));

	const toneClass = $derived(
		tone === 'over'
			? 'bg-destructive'
			: tone === 'near'
				? 'bg-amber-500'
				: 'bg-[var(--surface-accent)]'
	);
</script>

{#if capMinutes === null}
	<span
		class={cn('text-muted-foreground text-[11px] tabular-nums whitespace-nowrap', className)}
		data-cap="none"
		title="No due date — no cap"
	>
		{formatMinutes(committedMinutes)}
		<span class="opacity-70"> · no cap</span>
	</span>
{:else}
	<span class={cn('flex min-w-0 items-center gap-2', className)}>
		<span
			class="bg-[var(--surface-tag-bg)] relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
			role="progressbar"
			aria-label={`${formatMinutes(committedMinutes)} of ${formatMinutes(capMinutes)} committed`}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={percent}
		>
			<span
				class={cn('absolute inset-y-0 start-0 rounded-full transition-[width]', toneClass)}
				style={`width: ${percent}%`}
			></span>
			<span
				class="bg-foreground/35 absolute inset-y-[-2px] w-px"
				style={`inset-inline-start: ${marker}%`}
				aria-hidden="true"
			></span>
		</span>
		<span class="text-muted-foreground shrink-0 text-[11px] tabular-nums whitespace-nowrap">
			{formatMinutes(committedMinutes)} / {formatMinutes(capMinutes)}
		</span>
	</span>
{/if}
