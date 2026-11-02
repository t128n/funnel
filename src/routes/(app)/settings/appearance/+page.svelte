<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { resolvedTheme, setTheme, themeChoice, type ThemeChoice } from '#lib/client/theme';
	import * as RadioGroup from '#lib/components/ui/radio-group';

	/**
	 * Appearance section: one radio group. The choice applies immediately and is
	 * remembered in this browser. Options are grouped by spacing alone; the whole
	 * row is the radio target.
	 *
	 * Deliberate app-specific deviations from the t128n reference: the per-browser
	 * key is `funnel:theme` (not `t128n-theme`), and the theme controller also
	 * toggles a `.dark` compatibility class while components key off
	 * `[data-theme]`. Persistence, OS following, and the pre-paint script live in
	 * `#lib/client/theme` and `app.html`.
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

<div class="flex w-full max-w-[var(--layout-form-max)] flex-col gap-6">
	<section>
		<h2 class="text-heading-sm font-semibold leading-heading-sm text-fg">Theme</h2>
		<p class="mt-1 text-body leading-body text-fg-secondary">
			Applies immediately and is remembered in this browser.
		</p>

		<RadioGroup.Root
			value={choice}
			onValueChange={change}
			aria-label="Theme"
			class="mt-4 gap-2"
		>
			{#each options as option (option.value)}
				<RadioGroup.Item
					value={option.value}
					class="min-h-(--size-control-md) rounded-sm border-0 bg-transparent px-0 py-1.5 data-[state=checked]:bg-transparent"
				>
					<span class="flex min-w-0 flex-wrap items-baseline gap-x-2">
						<span class="font-semibold text-fg">{option.label}</span>
						{#if mounted && option.value === 'system' && choice === 'system'}
							<span class="text-body text-fg-secondary">· currently {resolvedLabel}</span>
						{/if}
					</span>
				</RadioGroup.Item>
			{/each}
		</RadioGroup.Root>
	</section>
</div>
