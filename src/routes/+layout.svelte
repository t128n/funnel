<script lang="ts">
	import { onMount } from 'svelte';
	import { HotkeysProvider } from '@tanstack/svelte-hotkeys';
	import { appHotkeys } from '#lib/client/hotkeys';
	import { initTheme } from '#lib/client/theme';
	import * as Tooltip from '#lib/components/ui/tooltip';
	import '#lib/styles/global.css';
	import '#lib/styles/markdown.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Keep the theme in sync with the OS and other tabs for the whole session.
	onMount(() => initTheme());
</script>

<HotkeysProvider {appHotkeys}>
	<Tooltip.Provider delayDuration={0}>
		{@render children()}
	</Tooltip.Provider>
</HotkeysProvider>
