<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto, refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import AppSidebar from '#lib/components/app-sidebar.svelte';
	import InspectorPane from '#lib/components/issue/InspectorPane.svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
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

	/** Focus the view's filter-bar search, navigating to Issues if needed. */
	async function focusSearch() {
		let input = document.getElementById('issue-search');
		if (!input) {
			await goto('/issues');
			await tick();
			input = document.getElementById('issue-search');
		}
		input?.focus();
	}

	function openNew() {
		void goto('/submit');
	}

	/** Global shortcuts: ⌘/Ctrl+K search, bare `C` quick-create. */
	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void focusSearch();
			return;
		}

		const target = event.target;
		const typing =
			target instanceof HTMLElement &&
			(target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'SELECT' ||
				target.isContentEditable);

		if (
			!typing &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			(event.key === 'c' || event.key === 'C')
		) {
			event.preventDefault();
			openNew();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<Sidebar.Provider class="h-svh overflow-hidden" style="--sidebar-width: 220px">
	<AppSidebar user={data.user} />

	<div class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
		<Sidebar.Inset class="min-h-0 overflow-hidden">
			<!-- Below `md` the sidebar renders as a Sheet with no other affordance,
			     so the cockpit needs its own trigger. -->
			<div class="flex shrink-0 items-center gap-2 border-b p-2 md:hidden">
				<Sidebar.Trigger />
				<span class="text-muted-foreground text-sm font-medium">funnel</span>
			</div>

			{@render children()}
		</Sidebar.Inset>

		{#if !ownsDetailCanvas && issue}
			<InspectorPane
				repo={issue.repo}
				number={issue.number}
				githubUrl={data.githubUrl}
				onclose={clearSelection}
			/>
		{/if}
	</div>
</Sidebar.Provider>
