<script lang="ts">
	import * as Field from '#lib/components/ui/field';
	import { setTheme, themeChoice, type ThemeChoice } from '#lib/client/theme';

	const options: { value: ThemeChoice; label: string; hint: string }[] = [
		{ value: 'system', label: 'System', hint: 'Follow your operating system setting.' },
		{ value: 'dark', label: 'Dark', hint: 'Always use the dark theme.' },
		{ value: 'light', label: 'Light', hint: 'Always use the light theme.' }
	];
</script>

<Field.Set>
	<Field.Legend variant="label">Theme</Field.Legend>
	<Field.Description class="-mt-1.5">
		Applies immediately and is remembered in this browser.
	</Field.Description>
	<div class="flex flex-col gap-2" role="radiogroup" aria-label="Theme">
		{#each options as option (option.value)}
			<Field.Label
				class="has-[:checked]:border-ring has-[:checked]:bg-muted/50 w-full cursor-pointer flex-row items-center gap-2.5 rounded-md border p-2.5 text-xs font-normal"
			>
				<input
					type="radio"
					name="theme"
					value={option.value}
					checked={$themeChoice === option.value}
					onchange={() => setTheme(option.value)}
				/>
				<span class="flex flex-col gap-0.5">
					<span class="font-medium">{option.label}</span>
					<span class="text-muted-foreground">{option.hint}</span>
				</span>
			</Field.Label>
		{/each}
	</div>
</Field.Set>
