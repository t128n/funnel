<script lang="ts">
	import { onMount } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import InspectorPane from '#lib/components/issue/InspectorPane.svelte';
	import Sidebar from '#lib/components/shell/Sidebar.svelte';
	import { connectEvents } from '#lib/client/events';
	import { bumpRefresh } from '#lib/client/refresh';
	import { clearSelection, parseSelection, selectedIssue } from '#lib/client/selection.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const selection = $derived(parseSelection());
	const issue = $derived(selectedIssue(selection));

	// Inbox and Issues own their detail canvas (SplitView); the shared layout
	// only docks the Inspector Pane for the remaining views (Board).
	const ownsDetailCanvas = $derived(
		page.url.pathname === '/inbox' || page.url.pathname === '/issues'
	);

	// Realtime bridge: any server-side mirror change refreshes the streams and
	// signals the Inspector to refetch (SPEC §3.2).
	onMount(() =>
		connectEvents(() => {
			void refreshAll();
			bumpRefresh();
		})
	);
</script>

<div class="shell" class:shell--inspecting={!ownsDetailCanvas && issue !== null}>
	<Sidebar user={data.user} />

	<main class="main">
		{@render children()}
	</main>

	{#if !ownsDetailCanvas && issue}
		<InspectorPane
			repo={issue.repo}
			number={issue.number}
			githubUrl={data.githubUrl}
			onclose={clearSelection}
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

		.shell :global(.sidebar .instance__name),
		.shell :global(.sidebar .nav__label),
		.shell :global(.sidebar .profile__meta),
		.shell :global(.sidebar .theme-trigger__label),
		.shell :global(.sidebar .theme-trigger__value),
		.shell :global(.sidebar .theme-trigger__caret) {
			display: none;
		}

		/* Collapsed rail: stack the header controls and center every glyph. */
		.shell :global(.sidebar .side-head) {
			flex-direction: column;
			height: auto;
			gap: var(--space-sm);
			padding: var(--space-sm) var(--space-xs);
		}

		.shell :global(.sidebar .side-head .instance) {
			flex: none;
			justify-content: center;
			padding: var(--space-xs);
			margin-left: 0;
		}

		.shell :global(.sidebar .side-head__actions) {
			flex-direction: column;
			gap: var(--space-xs);
		}

		.shell :global(.sidebar .nav__item) {
			justify-content: center;
			padding: 0;
		}

		/* Collapsed rail: the theme trigger narrows to its glyph. */
		.shell :global(.sidebar .theme-trigger) {
			justify-content: center;
			gap: 0;
			padding: var(--space-xs);
		}

		.shell :global(.sidebar .profile) {
			flex-direction: column;
			gap: var(--space-xs);
		}
	}
</style>
