<script lang="ts">
	interface Props {
		label: string;
		/** Hex (`aabbcc` or `#aabbcc`) or a CSS color; tints the chip. */
		color?: string | null;
		variant?: 'soft' | 'outline';
		title?: string;
		mono?: boolean;
	}

	let {
		label,
		color = null,
		variant = 'soft',
		title,
		mono = false
	}: Props = $props();

	// GitHub returns label colors as bare hex; normalise to a CSS color.
	const cssColor = $derived.by(() => {
		if (!color) return null;
		if (/^[0-9a-f]{6}$/i.test(color)) return `#${color}`;
		if (/^[0-9a-f]{3}$/i.test(color)) return `#${color}`;
		return color;
	});

	const style = $derived(cssColor ? `--chip-color: ${cssColor};` : '');
</script>

<span
	class="chip chip--{variant}"
	class:chip--mono={mono}
	class:chip--tinted={cssColor !== null}
	style={style}
	title={title ?? label}
>
	{label}
</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		height: 18px;
		padding: 0 var(--space-xs);
		border-radius: var(--radius-xs);
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		line-height: 1;
		white-space: nowrap;
		border: 1px solid transparent;
	}

	.chip--mono {
		font-family: var(--font-mono);
		letter-spacing: 0.02em;
	}

	.chip--soft {
		background: var(--color-surface-layer-2);
		color: var(--color-text-secondary);
		border-color: var(--color-border-subtle);
	}

	.chip--outline {
		background: transparent;
		color: var(--color-text-secondary);
		border-color: var(--color-border-strong);
	}

	.chip--tinted.chip--soft {
		background: color-mix(in srgb, var(--chip-color) 16%, transparent);
		border-color: color-mix(in srgb, var(--chip-color) 40%, transparent);
		color: color-mix(in srgb, var(--chip-color) 82%, var(--color-text-primary));
	}

	.chip--tinted.chip--outline {
		border-color: color-mix(in srgb, var(--chip-color) 60%, transparent);
		color: color-mix(in srgb, var(--chip-color) 82%, var(--color-text-primary));
	}
</style>
