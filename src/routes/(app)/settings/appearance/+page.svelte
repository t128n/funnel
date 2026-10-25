<script lang="ts">
	import { setTheme, themeChoice, type ThemeChoice } from '#lib/client/theme';

	/**
	 * Appearance section: one native radio group. The choice applies
	 * immediately and is remembered in this browser; rows are separated by 1px
	 * `--border` rules instead of a card shell.
	 */
	const options: { value: ThemeChoice; label: string; hint: string }[] = [
		{ value: 'light', label: 'Light', hint: 'Always use the light theme.' },
		{ value: 'dark', label: 'Dark', hint: 'Always use the dark theme.' },
		{ value: 'system', label: 'System', hint: 'Follow your operating system setting.' }
	];
</script>

<div class="mx-auto w-full max-w-3xl">
	<section class="max-w-lg">
		<h2 class="text-base font-semibold">Theme</h2>
		<p class="mt-1 text-xs text-muted-foreground">
			Applies immediately and is remembered in this browser.
		</p>

		<div class="mt-2 border-t border-[color:var(--border)]" role="radiogroup" aria-label="Theme">
			{#each options as option (option.value)}
				<label
					class="flex cursor-pointer items-baseline gap-2 border-b border-[color:var(--border)] py-2 text-sm font-normal"
				>
					<input
						type="radio"
						name="theme"
						value={option.value}
						checked={$themeChoice === option.value}
						onchange={() => setTheme(option.value)}
					/>
					<span class="font-medium">{option.label}</span>
					<span class="text-xs text-muted-foreground">{option.hint}</span>
				</label>
			{/each}
		</div>
	</section>
</div>
