<script lang="ts">
	import { cn } from '#lib/utils';
	import type { Snippet } from 'svelte';

	/**
	 * Compact, semi-translucent metadata tag used by board cards and list rows.
	 * Deliberately quieter than a shared chip so a row's title stays the focal
	 * point.
	 */
	interface Props {
		label: string;
		title?: string;
		tone?: 'neutral' | 'danger';
		/** Hex (`aabbcc` or `#aabbcc`) or a CSS color; tints the tag. */
		color?: string | null;
		class?: string;
		children?: Snippet;
	}

	let { label, title, tone = 'neutral', color = null, class: className, children }: Props =
		$props();

	// GitHub returns label colors as bare hex; normalise to a CSS color.
	const cssColor = $derived.by(() => {
		if (!color) return null;
		if (/^[0-9a-f]{6}$/i.test(color)) return `#${color}`;
		if (/^[0-9a-f]{3}$/i.test(color)) return `#${color}`;
		return color;
	});
</script>

<span
	class={cn(
		'inline-flex h-[18px] min-w-0 max-w-full items-center gap-1 rounded border px-1.5 text-[11px] leading-none',
		cssColor
			? 'border-[color-mix(in_srgb,var(--meta-color)_40%,transparent)] bg-[color-mix(in_srgb,var(--meta-color)_16%,transparent)] text-[color-mix(in_srgb,var(--meta-color)_82%,var(--foreground))]'
			: tone === 'danger'
				? 'border-destructive/20 bg-destructive/10 text-destructive/85'
				: 'border-[color:var(--border)] bg-[var(--muted)] text-muted-foreground',
		className
	)}
	style={cssColor ? `--meta-color: ${cssColor}` : undefined}
	title={title ?? label}
>
	{#if children}
		{@render children()}
	{/if}
	<span class="truncate">{label}</span>
</span>
