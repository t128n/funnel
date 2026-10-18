<script lang="ts">
	import { canonicalLabel } from '#lib/labels';
	import { cn } from '#lib/utils';
	import SignalHighIcon from '@lucide/svelte/icons/signal-high';
	import SignalLowIcon from '@lucide/svelte/icons/signal-low';
	import SignalMediumIcon from '@lucide/svelte/icons/signal-medium';

	/**
	 * Compact priority glyph (SPEC §5.1). Deliberately icon-only — no coloured
	 * pill — so a card's metadata line stays legible at a glance.
	 */
	const PRIORITY = {
		p1: { Icon: SignalHighIcon, label: 'Priority 1 (critical)' },
		p2: { Icon: SignalMediumIcon, label: 'Priority 2 (high)' },
		p3: { Icon: SignalLowIcon, label: 'Priority 3 (normal)' }
	} as const;

	interface Props {
		priority: string | null;
		class?: string;
	}

	let { priority, class: className }: Props = $props();

	const entry = $derived(
		priority ? (PRIORITY[priority.toLowerCase() as keyof typeof PRIORITY] ?? null) : null
	);
	const color = $derived(priority ? canonicalLabel(priority)?.color : undefined);
	const cssColor = $derived(
		color ? (/^[0-9a-f]{6}$/i.test(color) ? `#${color}` : color) : undefined
	);
</script>

{#if entry}
	<entry.Icon
		class={cn('size-3.5 shrink-0', className)}
		style={cssColor ? `color:${cssColor}` : undefined}
		strokeWidth={1.5}
		absoluteStrokeWidth
		role="img"
		aria-label={entry.label}
	/>
{/if}
