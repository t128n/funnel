<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Alert,
		Button,
		Input,
		InputGroup,
		InputGroupText,
		Table
	} from '@sveltestrap/sveltestrap';
	import { invalidateAll } from '$app/navigation';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import InboxTable from '#lib/components/inbox/InboxTable.svelte';
	import Breadcrumbs from '#lib/components/shell/Breadcrumbs.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { createFeed } from '#lib/client/feed.svelte';
	import { inboxEmptyState, inboxSummary } from '#lib/client/inbox';
	import { resurface } from '#lib/client/mutations';
	import {
		projectInboxEntries,
		reconcileIssues,
		reconcileSnoozedIssues,
		reconcileSubmissions
	} from '#lib/client/optimistic.svelte';
	import { FEED_ENDPOINTS } from '#lib/feeds';
	import { issuePath, submissionPath } from '#lib/issue-url';
	import { absoluteTime } from '#lib/time';
	import { activeFilterCount, buildFilterUrl, parseFilterParams } from '#lib/url-filter';
	import type { IssueListItem, RenderedInboxEntry } from '#lib/server/issues/types';
	import type { PageProps } from './$types';

	/**
	 * Inbox (Composition A §9): one centered page and one conventional table of
	 * pending intake submissions followed by untriaged issues. There is no
	 * split detail pane — submissions open `/inbox/submission/<id>` and issues
	 * open `/issues/<owner>/<repo>/<n>`.
	 *
	 * The layout server still loads the mixed feed; this page owns the paged
	 * window, the optimistic queue projection, and the sentinel pagination.
	 */
	let { data }: PageProps = $props();

	/** How close (px) the sentinel must be before the next page is fetched. */
	const END_THRESHOLD = 300;

	const inboxFeed = createFeed<RenderedInboxEntry>({
		endpoint: FEED_ENDPOINTS.inbox,
		initial: untrack(() => data.inbox),
		key: () => page.url.search,
		itemKey: (entry) =>
			entry.kind === 'submission'
				? `submission:${entry.submission.id}`
				: `issue:${entry.issue.repoId}:${entry.issue.number}`,
		query: () => new URLSearchParams(page.url.search)
	});

	// A fresh server page (initial load, filter change, SSE refresh) is merged
	// into the loaded window; a new filter key replaces it.
	$effect(() => {
		inboxFeed.sync(data.inbox);
	});

	const entries = $derived(projectInboxEntries(inboxFeed.items));
	const submissionCount = $derived(
		entries.filter((entry) => entry.kind === 'submission').length
	);
	// While every matching row is loaded (the normal queue) the projected rows
	// are the most current count, including an optimistic triage. A paginated
	// queue falls back to the server's split total so unloaded rows still count.
	const untriagedTotal = $derived(
		inboxFeed.nextCursor === null
			? entries.filter((entry) => entry.kind === 'issue').length
			: data.inbox.issueTotal
	);

	// Search shares the feed's `q` parameter with the global filter model, so a
	// query survives a refresh and deep links stay bookmarkable. The input keeps
	// the shared `#issue-search` id for the global ⌘K shortcut.
	const filter = $derived(parseFilterParams(page.url.searchParams));
	const filtered = $derived(activeFilterCount(filter) > 0);

	// The unfiltered queue count comes from the app layout (the navbar badge);
	// it is what tells an empty queue apart from a filtered view with no rows.
	const summary = $derived(
		inboxSummary({
			submissions: submissionCount,
			untriaged: untriagedTotal,
			matching: entries.length,
			queueTotal: data.inboxCount,
			filtered
		})
	);

	const repoSlugs = $derived(data.options.repos.map((repo) => repo.slug));

	// Drop overlays and submission hides once the authoritative queue reflects
	// them; a stale refresh leaves them in place.
	$effect(() => {
		const issueItems: IssueListItem[] = [];
		const submissionIds: string[] = [];
		for (const entry of data.inbox.items) {
			if (entry.kind === 'issue') issueItems.push(entry.issue);
			else submissionIds.push(entry.submission.id);
		}
		reconcileIssues(issueItems);
		reconcileSnoozedIssues(issueItems);
		reconcileSubmissions(submissionIds);
	});

	const showSnoozed = $derived(data.snoozedView);
	let resurfaceError = $state<string | null>(null);
	let resurfacing = $state<Record<string, boolean>>({});

	async function resurfaceItem(
		item: (typeof data.snoozedItems)[number]
	): Promise<void> {
		resurfaceError = null;
		resurfacing[item.key] = true;
		const target =
			item.kind === 'submission'
				? { kind: 'submission' as const, id: item.submissionId ?? '' }
				: { kind: 'issue' as const, repo: item.repo ?? '', number: item.number ?? 0 };
		const result = await resurface(target);
		delete resurfacing[item.key];
		if (!result.ok) {
			resurfaceError = result.error;
			return;
		}
		await invalidateAll();
	}

	// Search shares the feed's `q` parameter with the global filter model, so a
	// query survives a refresh and deep links stay bookmarkable. The input keeps
	// the shared `#issue-search` id for the page-local `/` shortcut; Mod+K opens
	// the shell's global search panel instead.
	let search = $state(untrack(() => filter.search));
	let searchFocused = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const fromUrl = filter.search;
		if (!searchFocused && fromUrl !== search) search = fromUrl;
	});

	// A navigation away must not fire a debounced `goto` afterwards.
	$effect(() => () => clearTimeout(searchTimer));

	function onSearchInput(value: string): void {
		search = value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			void goto(
				buildFilterUrl(page.url.pathname, page.url.searchParams, {
					...filter,
					search: value
				}),
				{ reset: false }
			);
		}, 250);
	}

	function clearSearch(): void {
		search = '';
		clearTimeout(searchTimer);
		void goto(
			buildFilterUrl(page.url.pathname, page.url.searchParams, {
				...filter,
				search: ''
			}),
			{ reset: false }
		);
	}

	/** Filter the Inbox issue half by Funnel's local waiting state. */
	function setWaitingFilter(next: boolean | null): void {
		void goto(
			buildFilterUrl(page.url.pathname, page.url.searchParams, {
				...filter,
				waiting: next
			}),
			{ reset: false }
		);
	}

	// Pagination walks the keyset cursor when a sentinel below the table comes
	// into view. The effect re-runs after each page lands, so a short page keeps
	// filling until the viewport is covered or the cursor runs out.
	let sentinel = $state<HTMLDivElement | null>(null);
	let sentinelVisible = $state(false);

	$effect(() => {
		const node = sentinel;
		if (!node) return;
		const observer = new IntersectionObserver(
			(records) => {
				sentinelVisible = records.some((record) => record.isIntersecting);
			},
			{ rootMargin: `${END_THRESHOLD}px 0px` }
		);
		observer.observe(node);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (!sentinelVisible) return;
		if (inboxFeed.loading || inboxFeed.error !== null) return;
		if (inboxFeed.nextCursor === null) return;
		void inboxFeed.loadMore();
	});

	const formData = $derived(
		page.form && typeof page.form.data === 'object' && page.form.data !== null
			? (page.form.data as Record<string, unknown>)
			: null
	);
	const formError = $derived(
		typeof formData?.message === 'string' ? formData.message : null
	);
	// Accept/dismiss success lands on this same route, so `page.form` is the
	// single status source for enhanced and no-JS submissions alike.
	const formSuccess = $derived(
		formData?.accepted === true
			? 'Submission accepted. It is no longer in the queue.'
			: formData?.dismissed === true
				? 'Submission dismissed.'
				: null
	);

	// Enhanced submissions report success locally: the action's `refreshAll`
	// re-runs loads and clears `page.form`, so the form prop alone is only
	// reliable for the no-JS POST-render path.
	let triageNotice = $state<string | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	function showNotice(message: string | null): void {
		triageNotice = message;
		clearTimeout(noticeTimer);
		if (message) noticeTimer = setTimeout(() => (triageNotice = null), 6000);
	}

	$effect(() => () => clearTimeout(noticeTimer));
</script>

<PageHead
	title="Inbox"
	description="Pending intake submissions and untriaged issues."
/>

<main class="container-xl py-4">
	<Breadcrumbs items={[{ label: 'Workspace', href: '/issues' }, { label: 'Inbox' }]} />

	<PageHeader
		title="Inbox"
		description={summary}
		actionsClass="flex-grow-1 flex-lg-grow-0"
	>
		{#snippet actions()}
			<div class="inbox-search">
				<label class="visually-hidden" for="issue-search">Search inbox</label>
				<InputGroup size="sm">
					<InputGroupText class="bg-body">
						<i class="bi bi-search" aria-hidden="true"></i>
					</InputGroupText>
					<Input
						id="issue-search"
						type="search"
						class="search-with-clear"
						placeholder="Search title, body, or comments"
						value={search}
						on:input={(event) => onSearchInput(event.currentTarget.value)}
						on:focus={() => (searchFocused = true)}
						on:blur={() => (searchFocused = false)}
					/>
					{#if search}
						<Button
							color="outline-secondary"
							size="sm"
							aria-label="Clear search"
							onclick={clearSearch}
						>
							<i class="bi bi-x-lg" aria-hidden="true"></i>
						</Button>
					{/if}
				</InputGroup>
			</div>
		{/snippet}
	</PageHeader>

	<div class="d-flex flex-wrap align-items-center gap-2 mb-3" role="group" aria-label="Inbox view">
		<Button
			color={showSnoozed ? 'outline-secondary' : 'primary'}
			size="sm"
			href={filter.search ? `/inbox?q=${encodeURIComponent(filter.search)}` : '/inbox'}
		>
			Queue
		</Button>
		<Button
			color={showSnoozed ? 'primary' : 'outline-secondary'}
			size="sm"
			href={filter.search
				? `/inbox?snoozed=1&q=${encodeURIComponent(filter.search)}`
				: '/inbox?snoozed=1'}
		>
			Snoozed
			{#if data.snoozedCount > 0}
				<span class="badge text-bg-secondary ms-1">{data.snoozedCount}</span>
			{/if}
		</Button>

		{#if !showSnoozed}
			<div class="ms-auto d-flex align-items-center gap-2">
				<span class="small text-body-secondary">Waiting</span>
				<div class="btn-group btn-group-sm" role="group" aria-label="Waiting filter">
					<Button
						color="outline-secondary"
						size="sm"
						active={filter.waiting === null}
						aria-pressed={filter.waiting === null}
						onclick={() => setWaitingFilter(null)}
					>
						Any
					</Button>
					<Button
						color="outline-secondary"
						size="sm"
						active={filter.waiting === true}
						aria-pressed={filter.waiting === true}
						onclick={() => setWaitingFilter(true)}
					>
						Waiting
					</Button>
					<Button
						color="outline-secondary"
						size="sm"
						active={filter.waiting === false}
						aria-pressed={filter.waiting === false}
						onclick={() => setWaitingFilter(false)}
					>
						Not waiting
					</Button>
				</div>
			</div>
		{/if}
	</div>

	{#if formError}
		<Alert color="danger" class="border d-flex align-items-center gap-2">
			<i class="bi bi-exclamation-circle" aria-hidden="true"></i>
			<span>{formError}</span>
		</Alert>
	{:else if triageNotice ?? formSuccess}
		<Alert color="success" class="border d-flex align-items-center gap-2" role="status">
			<i class="bi bi-check-circle" aria-hidden="true"></i>
			<span>{triageNotice ?? formSuccess}</span>
		</Alert>
	{/if}

	{#if showSnoozed}
		{#if resurfaceError}
			<Alert color="danger" class="border d-flex align-items-center gap-2">
				<i class="bi bi-exclamation-circle" aria-hidden="true"></i>
				<span>{resurfaceError}</span>
			</Alert>
		{/if}

		{#if data.snoozedItems.length === 0}
			<EmptyState
				title="Nothing is snoozed"
				description="Snooze an Inbox row to defer it. It will return automatically when its resurface date passes."
			>
				{#snippet action()}
					<Button color="outline-secondary" size="sm" href="/inbox">Back to the queue</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<div class="table-responsive border rounded">
				<Table hover class="align-middle mb-0">
					<caption class="visually-hidden">Snoozed Inbox items</caption>
					<thead class="table-light">
						<tr>
							<th scope="col" class="small text-body-secondary">Item</th>
							<th scope="col" class="small text-body-secondary d-none d-md-table-cell">Kind</th>
							<th scope="col" class="small text-body-secondary">Resurfaces</th>
							<th scope="col" class="small text-body-secondary text-end">Action</th>
						</tr>
					</thead>
					<tbody>
						{#each data.snoozedItems as item (item.key)}
							<tr>
								<td class="min-w-0">
									{#if item.kind === 'submission'}
										<a
											href={submissionPath(item.submissionId ?? '')}
											class="link-primary text-decoration-none"
											title={item.title}
										>
											{item.title}
										</a>
									{:else}
										<a
											href={issuePath('issues', item.repo ?? '', item.number ?? 0)}
											class="link-primary text-decoration-none"
											title={item.title}
										>
											{item.title}
										</a>
										<div class="small text-body-secondary font-monospace">
											{item.repo}#{item.number}
										</div>
									{/if}
									{#if !item.available}
										<div class="small text-warning-emphasis">
											This row is no longer in the mirror; resurface clears the snooze.
										</div>
									{/if}
								</td>
								<td class="small text-body-secondary d-none d-md-table-cell">
									{item.kind === 'submission' ? 'Submission' : 'Issue'}
								</td>
								<td class="small text-body-secondary text-nowrap">
									<time datetime={new Date(item.snoozedUntil).toISOString()}>
										{absoluteTime(item.snoozedUntil)}
									</time>
								</td>
								<td class="text-end text-nowrap">
									<Button
										color="outline-secondary"
										size="sm"
										disabled={resurfacing[item.key] === true}
										onclick={() => void resurfaceItem(item)}
									>
										Resurface
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</Table>
			</div>
		{/if}
	{:else if entries.length === 0}
		{#if inboxEmptyState(data.inboxCount) === 'clear'}
			<Alert color="success" class="border d-flex align-items-center gap-2">
				<i class="bi bi-check-circle" aria-hidden="true"></i>
				<span>Inbox is clear. Nothing is waiting for triage.</span>
			</Alert>
		{:else}
			<EmptyState
				title={filter.search
					? 'No submissions match this search'
					: 'No submissions match this view'}
				description={`The queue still has ${data.inboxCount} waiting item${
					data.inboxCount === 1 ? '' : 's'
				}.`}
			>
				{#snippet action()}
					{#if filter.search}
						<Button color="outline-secondary" size="sm" onclick={clearSearch}>
							Clear search
						</Button>
					{:else}
						<Button color="outline-secondary" size="sm" href="/inbox">Clear filters</Button>
					{/if}
				{/snippet}
			</EmptyState>
		{/if}
	{:else}
		<InboxTable
			{entries}
			repos={repoSlugs}
			repoShortcodes={data.repoShortcodes}
			defaultRepo={data.defaultRepo}
			onremove={(key) => inboxFeed.remove(key)}
			onnotice={showNotice}
		/>

		<div bind:this={sentinel} class="py-1" aria-hidden="true"></div>

		{#if inboxFeed.loading}
			<InlineStatus tone="info" message="Loading more…" />
		{:else if inboxFeed.error !== null}
			<InlineStatus tone="error" message={inboxFeed.error}>
				{#snippet action()}
					<Button color="link" size="sm" onclick={() => void inboxFeed.loadMore()}>
						Retry
					</Button>
				{/snippet}
			</InlineStatus>
		{/if}
	{/if}
</main>

<style>
	.inbox-search {
		min-width: 18rem;
		width: 100%;
	}

	@media (min-width: 992px) {
		.inbox-search {
			width: 18rem;
		}
	}
</style>
