<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { FormCheck } from '@sveltestrap/sveltestrap';
	import Section from '#lib/components/settings/section.svelte';
	import { resolvedTheme, setTheme, themeChoice, type ThemeChoice } from '#lib/client/theme';

	/**
	 * Appearance section: one radio group. The choice applies immediately and is
	 * remembered in this browser. Options are grouped by spacing alone; the whole
	 * row is the radio target.
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
	<div class="d-flex flex-column gap-2" role="radiogroup" aria-label="Theme">
		{#each options as option (option.value)}
			<div>
				<FormCheck
					type="radio"
					name="theme"
					value={option.value}
					checked={choice === option.value}
					on:change={() => change(option.value)}
					label={option.label}
				/>
				{#if mounted && option.value === 'system' && choice === 'system'}
					<div class="form-text ms-4">Currently {resolvedLabel}</div>
				{/if}
			</div>
		{/each}
	</div>
</Section>
