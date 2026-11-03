<script lang="ts">
	import { Progress } from '@sveltestrap/sveltestrap';
	import { barPercent, formatMinutes } from '#lib/planning';
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
		class="d-inline-flex align-items-center gap-1 small text-body-secondary tnum {className}"
		data-cap="none"
		title="No due date, so this milestone has no cap"
	>
		<span>Scheduled {formatMinutes(committedMinutes)}</span>
		<span class="text-body-tertiary">· no cap</span>
	</span>
{:else}
	<span class="d-flex min-w-0 flex-grow-1 flex-wrap align-items-center gap-2 {className}">
		<span class="capacity-track">
			<Progress
				bar={true}
				value={Math.min(100, Math.round(percent))}
				max={100}
				color={tone === 'over' ? 'danger' : 'primary'}
				class="capacity-fill"
				aria-label="Scheduled hours against the capacity cap"
				aria-valuetext={valueText}
				title={valueText}
			/>
		</span>
		<span class="flex-shrink-0 small text-body-secondary tnum">
			Scheduled {formatMinutes(committedMinutes)} of {formatMinutes(capMinutes)} cap
		</span>
		{#if tone === 'over' && overBy > 0}
			<span class="d-inline-flex align-items-center gap-1 small text-danger tnum flex-shrink-0">
				<i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
				<span>Over by {formatMinutes(overBy)}</span>
			</span>
		{/if}
	</span>
{/if}

<style>
	.capacity-track {
		display: block;
		min-width: 4rem;
		height: 0.5rem;
		flex: 1 1 auto;
		overflow: hidden;
		border-radius: var(--bs-border-radius-pill);
		background: var(--bs-secondary-bg);
	}

	:global(.capacity-fill) {
		height: 100%;
		border-radius: inherit;
	}

	.tnum {
		font-variant-numeric: tabular-nums;
	}
</style>
