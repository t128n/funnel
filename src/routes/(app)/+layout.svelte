<script lang="ts">
	import { onMount } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import InspectorPane from '#lib/components/issue/InspectorPane.svelte';
	import Sidebar from '#lib/components/shell/Sidebar.svelte';
	import { connectEvents } from '#lib/client/events';
	import { bumpRefresh } from '#lib/client/refresh';
	import { clearIssue, parseSelection } from '#lib/client/selection.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const selection = $derived(parseSelection());

	// Realtime bridge: any server-side mirror change refreshes the streams and
	// signals the Inspector to refetch (SPEC §3.2).
	onMount(() =>
		connectEvents(() => {
			void refreshAll();
			bumpRefresh();
		})
	);
</script>

<div class="shell" class:shell--inspecting={selection !== null}>
	<Sidebar user={data.user} />

	<main class="main">
		{@render children()}
	</main>

	{#if selection}
		<InspectorPane
			repo={selection.repo}
			number={selection.number}
			githubUrl={data.githubUrl}
			onclose={clearIssue}
		/>
	{/if}
</div>

<style>
	.shell {
		display: flex;
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		background: var(--color-surface-base);
	}

	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Below the widescreen breakpoint the inspector floats over the stream
	   rather than shrinking it (docs/DESIGN.md §Layout). */
	@media (max-width: 1100px) {
		.shell--inspecting :global(.inspector) {
			position: absolute;
			top: 0;
			right: 0;
			z-index: 40;
			max-width: 100%;
			box-shadow: var(--shadow-overlay);
		}
	}

	@media (max-width: 900px) {
		.shell :global(.sidebar) {
			width: 56px;
		}

		.shell :global(.sidebar .brand__text),
		.shell :global(.sidebar .nav__item span),
		.shell :global(.sidebar .ts-trigger__label),
		.shell :global(.sidebar .footer__link span),
		.shell :global(.sidebar .profile__meta) {
			display: none;
		}
	}
</style>
