<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { afterNavigate, goto, refreshAll } from '$app/navigation';
	import { createHotkeys, getAppHotkeys } from '@tanstack/svelte-hotkeys';
	import { Button } from '@sveltestrap/sveltestrap';
	import AppShell from '#lib/components/shell/AppShell.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import NewIssueDialog from '#lib/components/issue/NewIssueDialog.svelte';
	import { clearBulkSelection } from '#lib/client/bulk-selection.svelte';
	import { openGlobalSearch } from '#lib/client/global-search.svelte';
	import {
		dismissQuickCreateSuccess,
		openQuickCreate,
		quickCreate
	} from '#lib/client/quick-create';
	import { actionableCount, classifyAttention, toISODate } from '#lib/attention';
	import { connectEvents, type FunnelEvent } from '#lib/client/events';
	import { startNativeNotifications } from '#lib/client/native-notifications';
	import { clockTick, startClock } from '#lib/client/clock.svelte';
	import { bumpRefresh, type RefreshScope } from '#lib/client/refresh';
	import { setActiveLabelPrefix } from '#lib/labels';
	import { canWrite } from '#lib/roles';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Raw GitHub label names in feed/inspector payloads are recognized against
	// the configured vocabulary. The top-level call covers SSR and first mount;
	// the effect keeps it in step when settings refresh the layout data.
	setActiveLabelPrefix(untrack(() => data.labelPrefix));
	$effect(() => {
		setActiveLabelPrefix(data.labelPrefix);
	});

	const mayWrite = $derived(canWrite(data.user.role));
	/** Repositories the quick-create dialog can pick from. */
	const repoChoices = $derived(Object.keys(data.repoShortcodes).sort());

	// A selection belongs to the view it was made in. SSE refreshes are not
	// navigations, so `refreshAll` leaves checkboxes alone; any route/query
	// change clears them.
	afterNavigate(({ from }) => {
		if (from) clearBulkSelection();
	});

	// The Attention badge counts blocked overdue + due-today re-checks only.
	// Waiting has its own section and deliberately never raises this badge; it
	// stays visible on /attention regardless of the count.
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

	/**
	 * The global shortcut opens the one shell search panel from any route. Page
	 * filters keep their own state and are never focused by Mod+K.
	 */
	function openSearch() {
		openGlobalSearch();
	}

	/** `/` keeps focusing the current view's filter field when it has one. */
	function focusLocalSearch() {
		document.getElementById('issue-search')?.focus();
	}

	function openNew() {
		openQuickCreate();
	}

	// Global shortcuts come from the shared catalog, so labels, hints, and
	// registrations can never drift. `ignoreInputs: 'auto'` (the default)
	// already keeps the bare `C` from firing while the user types in a field,
	// while modifier shortcuts still work inside inputs.
	const hotkeys = getAppHotkeys();

	createHotkeys(() => [
		{ hotkey: hotkeys.current['nav.search'], callback: openSearch },
		{ hotkey: hotkeys.current['nav.search-slash'], callback: focusLocalSearch },
		{ hotkey: hotkeys.current['app.settings'], callback: () => void goto('/settings') },
		...(mayWrite
			? [{ hotkey: hotkeys.current['issue.create'], callback: openNew }]
			: [])
	]);
</script>

<AppShell
	user={data.user}
	repoShortcodes={data.repoShortcodes}
	{dueCount}
	inboxCount={data.inboxCount}
	unread={data.unreadNotifications}
	onSearch={openSearch}
>
	{#if $quickCreate.success}
		{@const success = $quickCreate.success}
		<div class="container-fluid px-3 px-lg-4 pt-3" data-quick-create-success>
			<InlineStatus tone="success" message={`Created ${success.repo}#${success.number}.`}>
				{#snippet action()}
					<span class="d-inline-flex align-items-center gap-3">
						<a
							href={success.htmlUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="text-nowrap"
						>
							Open on GitHub
						</a>
						<Button
							color="link"
							size="sm"
							class="p-0 text-decoration-none"
							onclick={dismissQuickCreateSuccess}
						>
							Dismiss
						</Button>
					</span>
				{/snippet}
			</InlineStatus>
		</div>
	{/if}

	{@render children()}
</AppShell>

<!-- Only writers can create; the hotkey and board control are gated too, and
     the server enforces the role on the POST. -->
{#if mayWrite}
	<NewIssueDialog
		repos={repoChoices}
		defaultRepo={data.defaultRepo}
		assignees={data.options.assignees}
		labelOptions={data.options.labels}
	/>
{/if}
