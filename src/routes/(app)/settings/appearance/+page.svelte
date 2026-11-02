<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { resolvedTheme, setTheme, themeChoice, type ThemeChoice } from '#lib/client/theme';
	import * as RadioGroup from '#lib/components/ui/radio-group';

	/**
	 * Appearance section: one radio group. The choice applies immediately and is
	 * remembered in this browser; rows are separated by 1 px rules instead of a
	 * card shell.
	 */
	const options: { value: ThemeChoice; label: string; description: string }[] = [
		{ value: 'system', label: 'System', description: 'Follow the operating system setting.' },
		{ value: 'light', label: 'Light', description: 'Always use the light theme.' },
		{ value: 'dark', label: 'Dark', description: 'Always use the dark theme.' }
	];

	let mounted = $state(false);
	let choice = $state<ThemeChoice>('system');

	onMount(() => {
		mounted = true;
		choice = get(themeChoice);
		const unsubscribe = themeChoice.subscribe((value) => (choice = value));
		return unsubscribe;
	});

	function change(value: string): void {
		setTheme(value as ThemeChoice);
	}
</script>

<div class="flex w-full max-w-[var(--layout-form-max)] flex-col gap-6">
	<section class="border-t border-border-subtle pt-4">
		<h2 class="text-heading-sm font-semibold leading-heading-sm text-fg">Theme</h2>
		<p class="mt-1 text-body leading-body text-fg-secondary">
			Applies immediately and is remembered in this browser.
			{#if mounted}Currently using the {$resolvedTheme} theme.{/if}
		</p>

		<RadioGroup.Root
			value={choice}
			onValueChange={change}
			aria-label="Theme"
			class="mt-4 gap-0"
		>
			{#each options as option (option.value)}
				<RadioGroup.Item
					value={option.value}
					class="rounded-none border-0 border-b border-border-subtle bg-transparent px-0 py-3 hover:bg-transparent data-[state=checked]:bg-transparent"
				>
					<span class="flex min-w-0 flex-col gap-0.5">
						<span class="font-semibold text-fg">{option.label}</span>
						<span class="text-body leading-body text-fg-secondary">{option.description}</span>
					</span>
				</RadioGroup.Item>
			{/each}
		</RadioGroup.Root>
	</section>
</div>
