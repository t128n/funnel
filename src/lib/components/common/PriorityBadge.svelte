<script lang="ts">
	import PriorityIcon from '#lib/components/common/PriorityIcon.svelte';
	import { priorityMeta } from '#lib/priority';
	import { cn } from '#lib/utils';
	import SignalZeroIcon from '@lucide/svelte/icons/signal-zero';

	/**
	 * Framed priority glyph (SPEC §5.1). A dedicated 18px target keeps the
	 * signal bars legible against the card/row surface and reserves the slot
	 * even when no priority is set, so metadata columns stay aligned whether or
	 * not an issue carries one.
	 */
	interface Props {
		priority: string | null;
		class?: string;
	}

	let { priority, class: className }: Props = $props();

	const color = $derived.by(() => {
		const meta = priorityMeta(priority);
		return meta ? `#${meta.color}` : null;
	});
</script>

<span
	class={cn(
		'inline-flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border',
		color
			? 'border-[color-mix(in_srgb,var(--priority-color)_45%,transparent)] bg-[color-mix(in_srgb,var(--priority-color)_16%,transparent)]'
			: 'border-[color:var(--border)] bg-[var(--muted)]',
		className
	)}
	style={color ? `--priority-color: ${color}` : undefined}
>
	{#if priority}
		<PriorityIcon {priority} />
	{:else}
		<SignalZeroIcon class="text-muted-foreground/60 size-3.5" />
	{/if}
</span>
