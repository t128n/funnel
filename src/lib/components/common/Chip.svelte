<script lang="ts">
	import { Badge } from '#lib/components/ui/badge';
	import { cn } from '#lib/utils';

	interface Props {
		label: string;
		/** Hex (`aabbcc` or `#aabbcc`) or a CSS color; tints the chip. */
		color?: string | null;
		variant?: 'soft' | 'outline';
		title?: string;
		mono?: boolean;
	}

	let { label, color = null, variant = 'soft', title, mono = false }: Props = $props();

	// GitHub returns label colors as bare hex; normalise to a CSS color.
	const cssColor = $derived.by(() => {
		if (!color) return null;
		if (/^[0-9a-f]{6}$/i.test(color)) return `#${color}`;
		if (/^[0-9a-f]{3}$/i.test(color)) return `#${color}`;
		return color;
	});

	/**
	 * Tinted chips borrow the label's own hue via `--chip-color`; the untinted
	 * fallbacks use the stock Badge tones. Built as utilities so `cn` resolves
	 * them against `Badge`'s own classes.
	 */
	const tone = $derived.by(() => {
		if (cssColor) {
			return variant === 'soft'
				? 'border-[color-mix(in_srgb,var(--chip-color)_40%,transparent)] bg-[color-mix(in_srgb,var(--chip-color)_16%,transparent)] text-[color-mix(in_srgb,var(--chip-color)_82%,var(--foreground))]'
				: 'border-[color-mix(in_srgb,var(--chip-color)_60%,transparent)] bg-transparent text-[color-mix(in_srgb,var(--chip-color)_82%,var(--foreground))]';
		}
		return variant === 'soft'
			? 'border-transparent bg-secondary text-secondary-foreground'
			: 'border-border bg-transparent text-foreground';
	});
</script>

<Badge
	variant="outline"
	title={title ?? label}
	class={cn(mono && 'mono', tone)}
	style={cssColor ? `--chip-color: ${cssColor}` : undefined}
>
	{label}
</Badge>
