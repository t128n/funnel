<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { FormCheck, FormText } from '@sveltestrap/sveltestrap';
	import Section from '#lib/components/settings/section.svelte';
	import { resolvedTheme, setTheme, themeChoice, type ThemeChoice } from '#lib/client/theme';

	/**
	 * Appearance section: one radio group. The choice applies immediately and is
	 * remembered in this browser.
	 *
	 * The theme controller owns persistence, OS following, and the pre-paint
	 * script lives in `app.html`. Bootstrap reads the `data-bs-theme` attribute it
	 * maintains.
	 */
	const options: { value: ThemeChoice; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	let mounted = $state(false);
	let choice = $state<ThemeChoice>('system');

	onMount(() => {
		mounted = true;
		choice = get(themeChoice);
		const unsubscribe = themeChoice.subscribe((value) => (choice = value));
		return unsubscribe;
	});

	const resolvedLabel = $derived($resolvedTheme === 'dark' ? 'Dark' : 'Light');

	function change(value: string): void {
		setTheme(value as ThemeChoice);
	}
</script>

<Section title="Theme" description="Applies immediately and is remembered in this browser.">
	<div>
		<div role="radiogroup" aria-label="Theme">
			{#each options as option (option.value)}
				<FormCheck
					type="radio"
					name="theme"
					value={option.value}
					checked={choice === option.value}
					on:change={() => change(option.value)}
					label={option.label}
					class="mb-1"
				/>
			{/each}
		</div>
		{#if mounted && choice === 'system'}
			<FormText>Following your operating system; currently {resolvedLabel.toLowerCase()}.</FormText>
		{/if}
	</div>
</Section>
