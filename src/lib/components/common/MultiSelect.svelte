<script lang="ts">
	import { DropdownMenu } from 'bits-ui';

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
	}

	let {
		label,
		options,
		selected,
		onselect,
		pinned = [],
		align = 'start',
		disabled = false,
		hideCount = false
	}: Props = $props();

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
		class="ms-trigger{selected.length > 0 ? ' ms-trigger--active' : ''}"
	>
		<span class="ms-trigger__label">{label}</span>
		{#if !hideCount && selected.length > 0}
			<span class="ms-trigger__count">{selected.length}</span>
		{/if}
		<svg class="ms-trigger__caret" viewBox="0 0 10 6" aria-hidden="true">
			<path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" />
		</svg>
	</DropdownMenu.Trigger>

	<DropdownMenu.Portal>
		<DropdownMenu.Content {align} sideOffset={6} class="ms-content">
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
		background: var(--color-surface-layer-1);
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
		background: var(--color-surface-layer-2);
	}

	:global(.ms-trigger--active) {
		border-color: var(--color-primary);
		color: var(--color-text-primary);
	}

	:global(.ms-trigger:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
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
