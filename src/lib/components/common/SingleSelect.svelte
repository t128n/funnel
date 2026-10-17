<script lang="ts">
	import { DropdownMenu } from 'bits-ui';

	export interface SingleSelectOption {
		value: string;
		label: string;
		color?: string | null;
	}

	interface Props {
		label: string;
		options: SingleSelectOption[];
		value: string | null;
		onselect: (value: string | null) => void;
		allowClear?: boolean;
		clearLabel?: string;
		disabled?: boolean;
	}

	let {
		label,
		options,
		value,
		onselect,
		allowClear = false,
		clearLabel = 'None',
		disabled = false
	}: Props = $props();

	const current = $derived(options.find((o) => o.value === value) ?? null);

	function cssColor(color: string | null | undefined): string | undefined {
		if (!color) return undefined;
		return /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : color;
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		{disabled}
		class="ss-trigger{value !== null ? ' ss-trigger--set' : ''}"
	>
		<span
			class="ss-dot"
			style={cssColor(current?.color) ? `background:${cssColor(current?.color)}` : undefined}
			class:ss-dot--hidden={!current?.color}
		></span>
		<span class="ss-trigger__text">{current?.label ?? label}</span>
		<svg class="ss-trigger__caret" viewBox="0 0 10 6" aria-hidden="true">
			<path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" />
		</svg>
	</DropdownMenu.Trigger>

	<DropdownMenu.Portal>
		<DropdownMenu.Content sideOffset={6} align="start" class="ss-content">
			<DropdownMenu.RadioGroup
				value={value ?? ''}
				onValueChange={(next) => onselect(next || null)}
			>
				{#each options as option (option.value)}
					<DropdownMenu.RadioItem value={option.value} class="ss-item">
						<span
							class="ss-dot"
							style={cssColor(option.color) ? `background:${cssColor(option.color)}` : undefined}
							class:ss-dot--hidden={!option.color}
						></span>
						<span class="ss-item__label">{option.label}</span>
						<span class="ss-check" aria-hidden="true">
							{#if value === option.value}✓{/if}
						</span>
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>

			{#if allowClear && value !== null}
				<DropdownMenu.Separator class="ss-separator" />
				<DropdownMenu.Item class="ss-clear" onSelect={() => onselect(null)}>
					{clearLabel}
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	:global(.ss-trigger) {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		width: 100%;
		height: 28px;
		padding: 0 var(--space-sm);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		cursor: pointer;
		text-align: left;
	}

	:global(.ss-trigger:hover) {
		border-color: var(--color-border-strong);
	}

	:global(.ss-trigger--set) {
		color: var(--color-text-primary);
	}

	:global(.ss-trigger:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ss-trigger__text {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ss-trigger__caret {
		width: 9px;
		height: 6px;
		opacity: 0.7;
		flex: none;
	}

	:global(.ss-content) {
		z-index: 60;
		min-width: 180px;
		padding: var(--space-xs);
		background: var(--color-surface-overlay-translucent);
		backdrop-filter: blur(var(--backdrop-blur));
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-overlay);
	}

	:global(.ss-item) {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-xs);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		outline: none;
	}

	:global(.ss-item:hover),
	:global(.ss-item[data-highlighted]) {
		background: var(--color-surface-layer-1);
		color: var(--color-text-primary);
	}

	.ss-item__label {
		flex: 1;
	}

	.ss-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		flex: none;
	}

	.ss-dot--hidden {
		visibility: hidden;
	}

	.ss-check {
		color: var(--color-primary);
		font-family: var(--font-mono);
		width: 12px;
		text-align: right;
	}

	:global(.ss-separator) {
		height: 1px;
		margin: var(--space-xs) 0;
		background: var(--color-border-subtle);
	}

	:global(.ss-clear) {
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-xs);
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		outline: none;
	}

	:global(.ss-clear:hover),
	:global(.ss-clear[data-highlighted]) {
		background: var(--color-surface-layer-1);
		color: var(--color-text-primary);
	}
</style>
