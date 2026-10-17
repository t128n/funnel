<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { setTheme, themeChoice, type ThemeChoice } from '#lib/client/theme';

	const options: { value: ThemeChoice; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'light', label: 'Light' }
	];

	const icons: Record<ThemeChoice, string> = {
		system: 'M8 2a6 6 0 100 12A6 6 0 008 2zm0 2v8a4 4 0 010-8z',
		dark: 'M10 2a6 6 0 103.3 11 5 5 0 01-3.3-11z',
		light:
			'M8 4.5A3.5 3.5 0 108 11.5 3.5 3.5 0 008 4.5zM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M13 3l-1 1M4 12l-1 1'
	};
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class="ts-trigger" title="Theme: {$themeChoice}">
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<path
				d={icons[$themeChoice]}
				fill={$themeChoice === 'light' ? 'none' : 'currentColor'}
				stroke="currentColor"
				stroke-width="1.2"
				stroke-linecap="round"
			/>
		</svg>
		<span class="ts-trigger__label">{$themeChoice}</span>
	</DropdownMenu.Trigger>

	<DropdownMenu.Portal>
		<DropdownMenu.Content side="top" align="start" sideOffset={6} class="ts-content">
			<DropdownMenu.RadioGroup
				value={$themeChoice}
				onValueChange={(value) => setTheme(value as ThemeChoice)}
			>
				{#each options as option (option.value)}
					<DropdownMenu.RadioItem value={option.value} class="ts-item">
						<span>{option.label}</span>
						<span class="ts-check" aria-hidden="true">
							{#if $themeChoice === option.value}✓{/if}
						</span>
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	:global(.ts-trigger) {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		width: 100%;
		padding: var(--space-xs) var(--space-sm);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		cursor: pointer;
		text-align: left;
	}

	:global(.ts-trigger:hover) {
		background: var(--color-surface-layer-2);
		color: var(--color-text-primary);
	}

	.ts-trigger__label {
		text-transform: capitalize;
	}

	:global(.ts-content) {
		z-index: 60;
		min-width: 150px;
		padding: var(--space-xs);
		background: var(--color-surface-overlay-translucent);
		backdrop-filter: blur(var(--backdrop-blur));
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-overlay);
	}

	:global(.ts-item) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-xs);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		outline: none;
	}

	:global(.ts-item:hover),
	:global(.ts-item[data-highlighted]) {
		background: var(--color-surface-layer-2);
		color: var(--color-text-primary);
	}

	.ts-check {
		color: var(--color-primary);
		font-family: var(--font-mono);
	}
</style>
