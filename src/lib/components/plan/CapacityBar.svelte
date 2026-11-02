<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { barPercent, formatMinutes } from '#lib/planning';
	import { cn } from '#lib/utils';
	import { capacityTone } from './format';

	/**
	 * A compact capacity meter. `capMinutes` already includes the configured
	 * allocation and the window length, so the bar is scheduled minutes over the
	 * cap and carries no separate allocation marker. A milestone without a due
	 * date has no cap (`capMinutes: null`), so it states scheduled hours without
	 * drawing a bar.
	 */
	interface Props {
		committedMinutes: number;
		capMinutes: number | null;
		class?: string;
	}

	let { committedMinutes, capMinutes, class: className = '' }: Props = $props();

	const tone = $derived(
		capMinutes === null ? 'empty' : capacityTone(committedMinutes, capMinutes)
	);
	const percent = $derived(
		capMinutes === null ? 0 : barPercent(committedMinutes, capMinutes)
	);
	const overBy = $derived(
		capMinutes === null ? 0 : Math.max(0, committedMinutes - capMinutes)
	);
	const valueText = $derived(
		capMinutes === null
			? `Scheduled ${formatMinutes(committedMinutes)} · no cap`
			: `Scheduled ${formatMinutes(committedMinutes)} of ${formatMinutes(capMinutes)} cap${
					tone === 'over' ? `, over by ${formatMinutes(overBy)}` : ''
				}`
	);
</script>

{#if capMinutes === null}
	<span
		class={cn('status status-muted tabular-nums', className)}
		data-cap="none"
		title="No due date, so this milestone has no cap"
	>
		<span>Scheduled {formatMinutes(committedMinutes)}</span>
		<span class="text-fg-muted">· no cap</span>
	</span>
{:else}
	<span class={cn('flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1', className)}>
		<span
			class="relative h-(--size-capacity-bar) min-w-16 flex-1 overflow-hidden rounded-full bg-surface-2"
			role="progressbar"
			aria-label="Scheduled hours against the capacity cap"
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
		</span>
		<span class="shrink-0 text-caption text-fg-secondary tabular-nums">
			Scheduled {formatMinutes(committedMinutes)} of {formatMinutes(capMinutes)} cap
		</span>
		{#if tone === 'over' && overBy > 0}
			<span class="status status-error shrink-0 tabular-nums">
				<TriangleAlertIcon aria-hidden="true" />
				<span>Over by {formatMinutes(overBy)}</span>
			</span>
		{/if}
	</span>
{/if}
