<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto, refreshAll } from '$app/navigation';
	import { createHotkeys, getAppHotkeys } from '@tanstack/svelte-hotkeys';
	import AppSidebar from '#lib/components/app-sidebar.svelte';
	import SettingsDialog from '#lib/components/settings/settings-dialog.svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { connectEvents } from '#lib/client/events';
	import { startClock } from '#lib/client/clock.svelte';
	import { bumpRefresh } from '#lib/client/refresh';
	import { openSettings } from '#lib/client/settings.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Realtime bridge: any server-side mirror change refreshes the streams and
	// signals the Inspector to refetch (SPEC §3.2). The shared clock keeps the
	// relative-time labels ticking even when no change arrives.
	onMount(() => {
		const stopClock = startClock();
		const stopEvents = connectEvents(() => {
			// Refresh the streams and signal the Inspector. Overlays are dropped
			// later, by value (see `reconcileIssues`), so a refresh carrying data
			// that does not yet reflect a write cannot bounce the UI back.
			void refreshAll()
				.then(() => bumpRefresh())
				.catch(() => {
					// A failed load leaves the current view (and overlays) intact.
				});
		});
		return () => {
			stopEvents();
			stopClock();
		};
	});

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

	// Global shortcuts come from the shared catalog, so labels, hints, and
	// registrations can never drift. `ignoreInputs: 'auto'` (the default)
	// already keeps the bare `C` from firing while the user types in a field,
	// while modifier shortcuts still work inside inputs.
	const hotkeys = getAppHotkeys();

	createHotkeys(() => [
		{ hotkey: hotkeys.current['nav.search'], callback: () => void focusSearch() },
		{ hotkey: hotkeys.current['app.settings'], callback: openSettings },
		{ hotkey: hotkeys.current['issue.create'], callback: openNew }
	]);
</script>

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
	</div>

	<SettingsDialog commentUi={data.commentBubbles ? 'bubbles' : 'compact'} />
</Sidebar.Provider>
