<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto, refreshAll } from '$app/navigation';
	import { createHotkeys, getAppHotkeys } from '@tanstack/svelte-hotkeys';
	import AppSidebar from '#lib/components/app-sidebar.svelte';
	import FooterNav from '#lib/components/nav/footer-nav.svelte';
	import * as Sidebar from '#lib/components/primitives/sidebar/index.js';
	import { actionableCount, classifyAttention, toISODate } from '#lib/attention';
	import { connectEvents, type FunnelEvent } from '#lib/client/events';
	import { startNativeNotifications } from '#lib/client/native-notifications';
	import { clockTick, startClock } from '#lib/client/clock.svelte';
	import { bumpRefresh, type RefreshScope } from '#lib/client/refresh';
	import { canWrite } from '#lib/roles';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const mayWrite = $derived(canWrite(data.user.role));

	// The Attention badge counts overdue + due-today re-checks; blocked issues
	// without a usable date are listed on the page but never raise the badge.
	// Dates are compared in the browser's timezone and re-evaluated on the shared
	// clock so the count is right after local midnight without a reload.
	const dueCount = $derived.by(() => {
		clockTick();
		return actionableCount(classifyAttention(data.attention, toISODate(new Date()), 7));
	});

	// Realtime bridge: any server-side mirror change refreshes the streams and
	// signals the Inspector to refetch (SPEC §3.2). Bursts coalesce into one
	// refresh behind a short trailing timer, and refreshes never overlap: an
	// event that lands mid-flight schedules one more pass instead of piling on.
	// The shared clock keeps the relative-time labels ticking even when no
	// change arrives.
	onMount(() => {
		const stopClock = startClock();
		// Browser notices are separate from the shared refresh signal: the SSE
		// payload carries no recipients, so the helper fetches this tab's own
		// unread feed when a `notifications` event arrives. It subscribes to the
		// same single stream opened here.
		const stopNative = startNativeNotifications(data.nativeNotifications);

		let timer: ReturnType<typeof setTimeout> | undefined;
		let inFlight = false;
		/** Set on teardown so an in-flight refresh cannot queue another pass. */
		let stopped = false;
		/** Scope of the queued burst; `null` means nothing is queued. */
		let pending: RefreshScope | null = null;

		// A repo slug is always `owner/name`, so the empty string can never match
		// an open issue. Non-`issues` events bump the signal with it to refresh
		// the streams without making the Inspector refetch its detail. Treat it
		// as neutral when a burst mixes event kinds: the issue events still scope
		// the burst, and a notifications-only burst still skips the Inspector.
		const NO_ISSUE_REPO = '';
		const noIssueScope: RefreshScope = { repo: NO_ISSUE_REPO };
		const isNoIssueScope = (scope: RefreshScope): boolean => scope.repo === NO_ISSUE_REPO;

		const scopeOf = (event: FunnelEvent): RefreshScope => {
			if (event.type !== 'issues') return noIssueScope;
			const repo = typeof event.repo === 'string' ? event.repo : undefined;
			if (repo === undefined) return {};
			const numbers = Array.isArray(event.numbers)
				? event.numbers.filter((value): value is number => typeof value === 'number')
				: undefined;
			return { repo, numbers };
		};

		// Two scoped events stay scoped only while they share a repo; anything
		// broader (or a repo-wide event) widens the burst to "all".
		const mergeScopes = (left: RefreshScope, right: RefreshScope): RefreshScope => {
			if (isNoIssueScope(left)) return right;
			if (isNoIssueScope(right)) return left;
			if (left.repo === undefined || right.repo === undefined || left.repo !== right.repo) {
				return {};
			}
			const a = left.numbers;
			const b = right.numbers;
			if (a === undefined || b === undefined || a.length === 0 || b.length === 0) {
				return { repo: left.repo };
			}
			return { repo: left.repo, numbers: [...new Set([...a, ...b])] };
		};

		const run = async () => {
			timer = undefined;
			if (stopped || inFlight || pending === null) return;
			const scope = pending;
			pending = null;
			inFlight = true;
			try {
				await refreshAll();
				bumpRefresh(scope);
			} catch {
				// A failed load leaves the current view (and overlays) intact.
			} finally {
				inFlight = false;
				// A burst arrived while refreshing; give it its own trailing pass.
				if (!stopped && pending !== null) schedule();
			}
		};

		const schedule = () => {
			if (stopped) return;
			if (timer !== undefined) clearTimeout(timer);
			timer = setTimeout(() => void run(), 300);
		};

		const stopEvents = connectEvents((event) => {
			// Overlays are dropped later, by value (see `reconcileIssues`), so a
			// refresh carrying data that does not yet reflect a write cannot
			// bounce the UI back.
			const scope = scopeOf(event);
			pending = pending === null ? scope : mergeScopes(pending, scope);
			schedule();
		});

		return () => {
			stopped = true;
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
			stopNative();
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
		void goto('/intake');
	}

	// Global shortcuts come from the shared catalog, so labels, hints, and
	// registrations can never drift. `ignoreInputs: 'auto'` (the default)
	// already keeps the bare `C` from firing while the user types in a field,
	// while modifier shortcuts still work inside inputs.
	const hotkeys = getAppHotkeys();

	createHotkeys(() => [
		{ hotkey: hotkeys.current['nav.search'], callback: () => void focusSearch() },
		{ hotkey: hotkeys.current['nav.search-slash'], callback: () => void focusSearch() },
		{ hotkey: hotkeys.current['app.settings'], callback: () => void goto('/settings') },
		...(mayWrite
			? [{ hotkey: hotkeys.current['issue.create'], callback: openNew }]
			: [])
	]);
</script>

<Sidebar.Provider class="h-svh overflow-hidden" style="--sidebar-width: 220px">
	<AppSidebar
		user={data.user}
		{dueCount}
		inboxCount={data.inboxCount}
		onSearch={focusSearch}
		onNewIssue={openNew}
	/>

	<div class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
		<Sidebar.Inset class="min-h-0 overflow-hidden">
			<!-- Below `md` the sidebar renders as a Sheet with no other affordance,
			     so the cockpit needs its own trigger. -->
			<div class="flex shrink-0 items-center gap-2 border-b p-2 md:hidden">
				<Sidebar.Trigger />
				<span class="text-muted-foreground text-sm font-medium">funnel</span>
				<a
					href="/attention"
					class="hover:underline focus-visible:ring-ring/50 ms-auto rounded-none text-xs outline-none focus-visible:ring-1"
					aria-label={dueCount > 0 ? `Attention: ${dueCount} due` : 'Attention'}
				>
					Attention{#if dueCount > 0}<span class="text-muted-foreground"> ({dueCount})</span>{/if}
				</a>
			</div>

			{@render children()}

			<FooterNav version={__APP_VERSION__} />
		</Sidebar.Inset>
	</div>
</Sidebar.Provider>
