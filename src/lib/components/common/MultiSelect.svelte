<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import type { Snippet } from 'svelte';

	export interface MultiSelectOption {
		value: string;
		label: string;
		color?: string | null;
	}

	interface Props {
		label: string;
		options: MultiSelectOption[];
		selected: string[];
		onselect: (values: string[]) => void;
		/** Values pinned to the top of the list (e.g. `me`). */
		pinned?: string[];
		align?: 'start' | 'end';
		disabled?: boolean;
		/** Hide the count badge even when values are selected. */
		hideCount?: boolean;
		/**
		 * `label` (default) keeps the trigger text static and relies on the count
		 * badge — the filter toolbars' dimension-name style. `selection` shows the
		 * selected option labels instead, using {@link placeholder} when empty.
		 */
		display?: 'label' | 'selection';
		/** Shown in `selection` display mode when nothing is selected. */
		placeholder?: string;
		/** Trigger styling: `default` (filter toolbar) or `ghost` (borderless pill). */
		variant?: 'default' | 'ghost';
		/** Optional leading glyph rendered inside the trigger. */
		icon?: Snippet;
	}

	let {
		label,
		options,
		selected,
		onselect,
		pinned = [],
		align = 'start',
		disabled = false,
		hideCount = false,
		display = 'label',
		placeholder,
		variant = 'default',
		icon
	}: Props = $props();

	const triggerText = $derived.by(() => {
		if (display !== 'selection') return label;
		if (selected.length === 0) return placeholder ?? label;
		return selected
			.map((value) => options.find((o) => o.value === value)?.label ?? value)
			.join(', ');
	});

	const ordered = $derived.by(() => {
		const pinnedSet = new Set(pinned);
		const head = options.filter((o) => pinnedSet.has(o.value));
		const tail = options.filter((o) => !pinnedSet.has(o.value));
		return [...head, ...tail];
	});

	function cssColor(color: string | null | undefined): string | undefined {
		if (!color) return undefined;
		return /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : color;
	}

	function toggle(value: string) {
		onselect(
			selected.includes(value)
				? selected.filter((entry) => entry !== value)
				: [...selected, value]
		);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		{disabled}
		class="ms-trigger{selected.length > 0 ? ' ms-trigger--active' : ''}{variant === 'ghost' ? ' ms-trigger--ghost' : ''}"
	>
		{#if icon}
			<span class="ms-trigger__icon" aria-hidden="true">{@render icon()}</span>
		{/if}
		<span class="ms-trigger__label">{triggerText}</span>
		{#if !hideCount && selected.length > 0}
			<span class="ms-trigger__count">{selected.length}</span>
		{/if}
		<svg class="ms-trigger__caret" viewBox="0 0 10 6" aria-hidden="true">
			<path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" />
		</svg>
	</DropdownMenu.Trigger>

	<DropdownMenu.Portal>
		<!--
			`preventScroll={false}` keeps the menu non-modal: bits-ui locks the
			body (and sets `pointer-events: none` on it) when `preventScroll` is
			true, which retargets the follow-up click to <html> and makes outer
			popovers (e.g. FilterPopover) treat it as an outside click.
			`strategy="fixed"` preserves the fixed positioning, since bits-ui
			derives the strategy from `preventScroll` internally.
		-->
		<DropdownMenu.Content
			{align}
			sideOffset={6}
			class="ms-content"
			preventScroll={false}
			strategy="fixed"
		>
			{#if ordered.length === 0}
				<div class="ms-empty">No options</div>
			{:else}
				{#each ordered as option (option.value)}
					<DropdownMenu.CheckboxItem
						class="ms-item"
						checked={selected.includes(option.value)}
						closeOnSelect={false}
						onCheckedChange={() => toggle(option.value)}
					>
						<span
							class="ms-dot"
							style={cssColor(option.color) ? `background:${cssColor(option.color)}` : undefined}
							class:ms-dot--hidden={!option.color}
						></span>
						<span class="ms-item__label">{option.label}</span>
						<span class="ms-check" aria-hidden="true">
							{#if selected.includes(option.value)}✓{/if}
						</span>
					</DropdownMenu.CheckboxItem>
				{/each}
			{/if}

			{#if selected.length > 0}
				<DropdownMenu.Separator class="ms-separator" />
				<DropdownMenu.Item class="ms-clear" onSelect={() => onselect([])}>
					Clear
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	:global(.ms-trigger) {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		height: 26px;
		padding: 0 var(--space-sm);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		cursor: pointer;
		transition:
			background var(--transition-fast),
			border-color var(--transition-fast);
	}

	:global(.ms-trigger:hover) {
		background: var(--color-surface-overlay);
	}

	:global(.ms-trigger--active) {
		border-color: var(--color-primary);
		color: var(--color-text-primary);
	}

	:global(.ms-trigger:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ms-trigger__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		flex: none;
	}

	/* Ghost variant: borderless Linear-style property pill (issue inspector). */
	:global(.ms-trigger--ghost) {
		height: 26px;
		background: transparent;
		border-color: var(--color-btn-border);
		color: var(--color-nav-text);
		font-weight: 450;
	}

	:global(.ms-trigger--ghost:hover) {
		background: var(--color-nav-bg-hover);
		border-color: var(--color-btn-border);
		color: var(--color-nav-text-hover);
	}

	:global(.ms-trigger--ghost.ms-trigger--active) {
		border-color: var(--color-btn-border);
		color: var(--color-nav-text-hover);
	}

	:global(.ms-trigger--ghost .ms-trigger__count) {
		display: none;
	}

	:global(.ms-trigger--ghost .ms-trigger__label) {
		max-width: 220px;
	}

	.ms-trigger__label {
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ms-trigger__count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: var(--radius-full);
		background: var(--color-primary);
		color: var(--color-on-primary);
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: var(--weight-semibold);
	}

	.ms-trigger__caret {
		width: 9px;
		height: 6px;
		opacity: 0.7;
		flex: none;
	}

	:global(.ms-content) {
		z-index: 60;
		min-width: 200px;
		max-height: 320px;
		overflow-y: auto;
		padding: var(--space-xs);
		background: var(--color-surface-overlay-translucent);
		backdrop-filter: blur(var(--backdrop-blur));
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-overlay);
	}

	:global(.ms-item),
	:global(.ms-clear) {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-xs);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		user-select: none;
		outline: none;
	}

	:global(.ms-item:hover),
	:global(.ms-item[data-highlighted]),
	:global(.ms-clear:hover),
	:global(.ms-clear[data-highlighted]) {
		background: var(--color-surface-layer-2);
		color: var(--color-text-primary);
	}

	.ms-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		flex: none;
	}

	.ms-dot--hidden {
		visibility: hidden;
	}

	.ms-item__label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ms-check {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--color-primary);
		width: 12px;
		text-align: right;
	}

	:global(.ms-separator) {
		height: 1px;
		margin: var(--space-xs) 0;
		background: var(--color-border-subtle);
	}

	.ms-empty {
		padding: var(--space-sm);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	:global(.ms-clear) {
		color: var(--color-text-muted);
	}
</style>
