<script lang="ts">
	import { priorityMeta } from '#lib/priority';

	/**
	 * Compact priority glyph. The three tiers reuse the signal-bar metaphor and
	 * stay icon-only so a card's metadata line remains legible at a glance.
	 */
	const ICONS: Record<string, string> = {
		P1: 'bi-reception-4',
		P2: 'bi-reception-2',
		P3: 'bi-reception-0'
	};

	interface Props {
		priority: string | null;
		class?: string;
	}

	let { priority, class: className = '' }: Props = $props();

	const meta = $derived(priorityMeta(priority));
	const icon = $derived(meta ? ICONS[meta.value] : null);
	const cssColor = $derived(meta ? `#${meta.color}` : undefined);
	const label = $derived(meta ? `Priority ${meta.value} (${meta.name})` : null);
</script>

{#if icon && label}
	<i
		class="bi {icon} {className}"
		style={cssColor ? `color:${cssColor}` : undefined}
		role="img"
		aria-label={label}
	></i>
{/if}
