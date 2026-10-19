<script lang="ts">
	import { onMount } from 'svelte';
	import { HotkeysProvider } from '@tanstack/svelte-hotkeys';
	import { appHotkeys } from '#lib/client/hotkeys';
	import { initTheme } from '#lib/client/theme';
	import { Toaster } from '#lib/components/ui/sonner';
	import '#lib/styles/global.css';
	import '#lib/styles/markdown.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Keep the theme in sync with the OS and other tabs for the whole session.
	onMount(() => initTheme());
</script>

<HotkeysProvider {appHotkeys}>
	{@render children()}
	<Toaster />
</HotkeysProvider>
