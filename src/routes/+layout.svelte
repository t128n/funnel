<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '#lib/assets/favicon.svg';
	import { initTheme } from '#lib/client/theme';
	import '@fontsource-variable/inter';
	import '@fontsource-variable/jetbrains-mono';
	import '#lib/styles/tokens.css';
	import '#lib/styles/global.css';
	import '#lib/styles/markdown.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Keep the theme in sync with the OS and other tabs for the whole session.
	onMount(() => initTheme());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
