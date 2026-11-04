<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Alert,
		Breadcrumb,
		BreadcrumbItem,
		Button,
		Input,
		InputGroup,
		InputGroupText
	} from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import InboxTable from '#lib/components/inbox/InboxTable.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { createFeed } from '#lib/client/feed.svelte';
	import {
		projectInboxEntries,
		reconcileIssues,
		reconcileSubmissions
	} from '#lib/client/optimistic.svelte';
	import { FEED_ENDPOINTS } from '#lib/feeds';
	import { buildFilterUrl, parseFilterParams } from '#lib/url-filter';
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

	// The server total covers the whole queue; the optimistic projection may
	// hide loaded rows, so subtract exactly those from the head count.
	const hidden = $derived(Math.max(0, inboxFeed.items.length - entries.length));
	const untriagedTotal = $derived(
		Math.max(0, inboxFeed.total - hidden - submissionCount)
	);

	function countOf(count: number, noun: string): string {
		return `${count} ${noun}${count === 1 ? '' : 's'}`;
	}

	const summary = $derived(
		`${countOf(submissionCount, 'submission')} · ${countOf(untriagedTotal, 'untriaged issue')}`
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
		reconcileSubmissions(submissionIds);
	});

	// Search shares the feed's `q` parameter with the global filter model, so a
	// query survives a refresh and deep links stay bookmarkable. The input keeps
	// the shared `#issue-search` id for the page-local `/` shortcut; Mod+K opens
	// the shell's global search panel instead.
	const filter = $derived(parseFilterParams(page.url.searchParams));
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
		onSearchInput('');
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

	const formError = $derived(
		page.form && 'message' in (page.form.data ?? {})
			? ((page.form.data as { message?: string }).message ?? null)
			: null
	);
</script>

<PageHead
	title="Inbox"
	description="Pending intake submissions and untriaged issues."
/>

<main class="container-xl py-4">
	<Breadcrumb class="mb-2">
		<BreadcrumbItem>
			<a href="/issues">Workspace</a>
		</BreadcrumbItem>
		<BreadcrumbItem active>Inbox</BreadcrumbItem>
	</Breadcrumb>

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

	{#if formError}
		<Alert color="danger" class="border d-flex align-items-center gap-2">
			<i class="bi bi-exclamation-circle" aria-hidden="true"></i>
			<span>{formError}</span>
		</Alert>
	{/if}

	{#if entries.length === 0}
		<Alert color="success" class="border d-flex align-items-center gap-2">
			<i class="bi bi-check-circle" aria-hidden="true"></i>
			<span>Inbox is clear. Nothing is waiting for triage.</span>
		</Alert>
	{:else}
		<InboxTable
			{entries}
			repos={repoSlugs}
			repoShortcodes={data.repoShortcodes}
			defaultRepo={data.defaultRepo}
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
