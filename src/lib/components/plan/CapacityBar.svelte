<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
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
		/** Render the committed/cap value beside the track. */
		showValue?: boolean;
		class?: string;
	}

	let {
		committedMinutes,
		capMinutes,
		allocationPercent = 60,
		showValue = true,
		class: className = ''
	}: Props = $props();

	const tone = $derived(
		capMinutes === null ? 'empty' : capacityTone(committedMinutes, capMinutes)
	);
	const percent = $derived(
		capMinutes === null ? 0 : barPercent(committedMinutes, capMinutes)
	);
	const marker = $derived(Math.min(100, Math.max(0, allocationPercent)));
	const overBy = $derived(
		capMinutes === null ? 0 : Math.max(0, committedMinutes - capMinutes)
	);
	const valueText = $derived(
		capMinutes === null
			? `${formatMinutes(committedMinutes)}, no cap`
			: `${formatMinutes(committedMinutes)} of ${formatMinutes(capMinutes)} committed${tone === 'over' ? ', over capacity' : ''}`
	);
</script>

{#if capMinutes === null}
	<span
		class={cn('status status-muted tabular-nums', className)}
		data-cap="none"
		title="No due date — no cap"
	>
		<span>{formatMinutes(committedMinutes)}</span>
		<span class="text-fg-muted">· no cap</span>
	</span>
{:else}
	<span class={cn('flex min-w-0 items-center gap-2', className)}>
		<span
			class="relative h-(--size-capacity-bar) min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
			role="progressbar"
			aria-label="Committed capacity"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.min(100, percent)}
			aria-valuetext={valueText}
			title={valueText}
		>
			<span
				class={cn(
					'absolute inset-y-0 start-0 rounded-full',
					tone === 'over' ? 'bg-error' : 'bg-primary'
				)}
				style={`width: ${Math.min(100, percent)}%`}
			></span>
			<span
				class="absolute inset-y-0 w-px bg-border-strong"
				style={`inset-inline-start: ${marker}%`}
				aria-hidden="true"
			></span>
		</span>
		{#if showValue}
			{#if tone === 'over' && overBy > 0}
				<span class="status status-error shrink-0 tabular-nums">
					<TriangleAlertIcon aria-hidden="true" />
					<span>Over by {formatMinutes(overBy)}</span>
				</span>
			{:else}
				<span class="shrink-0 text-caption text-fg-secondary tabular-nums">
					{formatMinutes(committedMinutes)} / {formatMinutes(capMinutes)}
				</span>
			{/if}
		{/if}
	</span>
{/if}
