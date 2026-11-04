<script lang="ts">
	import { onMount } from 'svelte';
	import { HotkeysProvider } from '@tanstack/svelte-hotkeys';
	import { appHotkeys } from '#lib/client/hotkeys';
	import { initDialogFocus } from '#lib/client/modal-focus';
	import { initTheme } from '#lib/client/theme';
	import 'bootstrap/dist/css/bootstrap.min.css';
	import 'bootstrap-icons/font/bootstrap-icons.css';
	import '#lib/styles/app.css';
	import '#lib/styles/markdown.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Keep the theme in sync with the OS and other tabs for the whole session,
	// and give every Sveltestrap dialog its focus trap, semantics, and return
	// target in one place.
	onMount(() => {
		const stopTheme = initTheme();
		const stopDialogFocus = initDialogFocus();
		return () => {
			stopTheme();
			stopDialogFocus();
		};
	});
</script>

<HotkeysProvider {appHotkeys}>
	{@render children()}
</HotkeysProvider>
