<script lang="ts">
	import { cn } from '#lib/utils';
	import { priorityMeta } from '#lib/priority';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import SignalHighIcon from '@lucide/svelte/icons/signal-high';
	import SignalLowIcon from '@lucide/svelte/icons/signal-low';
	import SignalMediumIcon from '@lucide/svelte/icons/signal-medium';

	/**
	 * Compact priority glyph (SPEC §5.1, DESIGN "Priority & Urgency Tokens").
	 * P0 is the designed Urgent token; the other tiers use signal bars. Kept
	 * icon-only so a card's metadata line stays legible at a glance.
	 */
	const ICONS = {
		P0: CircleAlertIcon,
		P1: SignalHighIcon,
		P2: SignalMediumIcon,
		P3: SignalLowIcon
	} as const;

	interface Props {
		priority: string | null;
		class?: string;
	}

	let { priority, class: className }: Props = $props();

	const meta = $derived(priorityMeta(priority));
	const Icon = $derived(meta ? ICONS[meta.value] : null);
	const cssColor = $derived(meta ? `#${meta.color}` : undefined);
	const label = $derived(meta ? `Priority ${meta.value} (${meta.name})` : null);
</script>

{#if Icon && label}
	<Icon
		class={cn('size-3.5 shrink-0', className)}
		style={cssColor ? `color:${cssColor}` : undefined}
		strokeWidth={1.5}
		absoluteStrokeWidth
		role="img"
		aria-label={label}
	/>
{/if}
