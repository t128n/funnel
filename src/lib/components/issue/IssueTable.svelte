<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { Badge, Button, Table } from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PriorityText from '#lib/components/common/PriorityText.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import {
		getGroupBy,
		isGroupCollapsed,
		toggleGroup
	} from '#lib/client/list-prefs.svelte';
	import type { Feed } from '#lib/client/feed.svelte';
	import { buildGroups, type ProjectOption } from '#lib/components/issue/grouping';
	import { weekHeadline } from '#lib/components/plan/format';
	import { issuePath } from '#lib/issue-url';
	import { issueRef } from '#lib/issue-ref';
	import { canonicalLabel } from '#lib/labels';
	import { isRetiredPriorityLabel } from '#lib/priority';
	import { inlineLabels } from '#lib/components/issue/labels-inline';
	import type { IssueListItem } from '#lib/server/issues/types';

	/**
	 * Composition A issue index: a grouped table inside a bordered responsive
	 * wrapper. Rows carry a real title link; the row itself stays a pointer
	 * shortcut. Below `md` the metadata columns collapse into one secondary line
	 * under the title, so the page never scrolls sideways. At `md` the title
	 * keeps the remainder while Planned and Assignee wait for wider screens.
	 *
	 * The feed owns the loaded window. A sentinel after the table asks for the
	 * next keyset page while the reader is still ~300px above the end.
	 */
	interface Props {
		feed: Feed<IssueListItem>;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
		/** Configured project indicators for group-by-project. */
		projects?: ProjectOption[];
		/** Reset every active filter (header and empty-state actions). */
		onclear?: (() => void) | null;
		/** Optimistic overlay projection applied to every loaded row. */
		project?: ((issues: IssueListItem[]) => IssueListItem[]) | null;
		/** Single repository scope for the footer, or `null` for all repositories. */
		repoScope?: string | null;
	}

	let {
		feed,
		repoShortcodes = {},
		projects = [],
		onclear = null,
		project = null,
		repoScope = null
	}: Props = $props();

	/** How close to the end (px) the sentinel must be to fetch the next page. */
	const END_THRESHOLD = 300;
	const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

	const source = $derived(feed.items);
	const projected = $derived(project ? project(source) : source);
	const groupBy = $derived(getGroupBy());

	const groups = $derived.by(() => {
		const built = buildGroups(projected, groupBy, repoShortcodes, projects);
		// No grouping, or a grouping dimension with nothing to section: render
		// one flat "All issues" section so the table still has group context.
		if (groupBy === 'none' || built.length === 0) {
			return projected.length > 0
				? [{ key: 'all', label: 'All issues', issues: projected }]
				: [];
		}
		return built;
	});

	/** Filtered total, not the loaded window. */
	const count = $derived(feed.total);
	/** Loaded rows in this window. */
	const shown = $derived(source.length);

	const loading = $derived(Boolean(feed.loading && source.length === 0));
	const failed = $derived(Boolean(feed.error !== null && source.length === 0));
	const empty = $derived(!loading && !failed && projected.length === 0);

	const footerLabel = $derived(
		shown === count
			? `Showing ${count.toLocaleString()} ${count === 1 ? 'issue' : 'issues'}`
			: `Showing ${shown.toLocaleString()} of ${count.toLocaleString()} issues`
	);

	function titleOf(issue: IssueListItem): string {
		return issue.title.trim() || 'Untitled';
	}

	function refOf(issue: IssueListItem): string {
		return issueRef(issue.repo, issue.number, repoShortcodes);
	}

	/** Non-reserved labels only; reserved groups render as dedicated columns. */
	function labelsOf(issue: IssueListItem): string[] {
		return issue.labels.filter(
			(label) => !canonicalLabel(label) && !isRetiredPriorityLabel(label)
		);
	}

	function assigneesOf(issue: IssueListItem): string {
		return issue.assignees.map((person) => person.login).join(', ');
	}

	/** `2 Nov 2026` for a committed week, or `null` when unplanned. */
	function planOf(issue: IssueListItem): string | null {
		return issue.planWeek
			? weekHeadline(issue.planWeek).replace('Week of ', '')
			: null;
	}

	function openIssue(issue: IssueListItem): void {
		void goto(issuePath('issues', issue.repo, issue.number));
	}

	function isInteractive(target: EventTarget | null): boolean {
		return (
			target instanceof Element &&
			target.closest('a, button, input, select, textarea, label') !== null
		);
	}

	function onRowClick(event: MouseEvent, issue: IssueListItem): void {
		if (event.defaultPrevented || isInteractive(event.target)) return;
		// Do not hijack a text selection.
		if (window.getSelection()?.toString()) return;
		openIssue(issue);
	}

	let sentinel = $state<HTMLDivElement | null>(null);

	function nearEnd(node: HTMLElement): boolean {
		return node.getBoundingClientRect().top <= window.innerHeight + END_THRESHOLD;
	}

	/** Fetch the next page when the sentinel enters the trailing window. */
	$effect(() => {
		const node = sentinel;
		if (!node || typeof window === 'undefined') return;

		const check = () => {
			if (feed.loading || feed.error !== null || feed.nextCursor === null) return;
			if (nearEnd(node)) void feed.loadMore();
		};

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) check();
			},
			{ rootMargin: `${END_THRESHOLD}px 0px` }
		);
		observer.observe(node);
		window.addEventListener('scroll', check, { passive: true });
		return () => {
			observer.disconnect();
			window.removeEventListener('scroll', check);
		};
	});

	// An append can leave the sentinel inside the window; re-check after the
	// table paints so short pages keep filling until the cursor is exhausted.
	$effect(() => {
		const loaded = feed.items.length;
		const busy = feed.loading;
		const cursor = feed.nextCursor;
		if (!sentinel || loaded === 0) return;
		void tick().then(() => {
			if (busy || cursor === null || !sentinel) return;
			if (nearEnd(sentinel)) void feed.loadMore();
		});
	});
</script>

{#snippet retryInitial()}
	<Button color="secondary" outline size="sm" onclick={() => void feed.refreshLoaded()}>
		Retry
	</Button>
{/snippet}

{#snippet retryMore()}
	<Button color="secondary" outline size="sm" onclick={() => void feed.loadMore()}>
		Retry
	</Button>
{/snippet}

{#if loading}
	<div class="table-responsive border rounded" role="status" aria-label="Loading issues…">
		<Table hover class="align-middle mb-0">
			<thead class="table-light">
				<tr>
					<th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 5.5rem;">Issue</th>
					<th scope="col" class="small text-body-secondary">Title</th>
					<th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 7rem;">Status</th>
					<th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 6rem;">Priority</th>
					<th scope="col" class="small text-body-secondary d-none d-xl-table-cell" style="width: 8rem;">Planned</th>
					<th scope="col" class="small text-body-secondary d-none d-lg-table-cell" style="width: 9rem;">Assignee</th>
					<th scope="col" class="small text-body-secondary text-end d-none d-lg-table-cell" style="width: 7rem;">Updated</th>
				</tr>
			</thead>
			<tbody>
				{#each SKELETON_ROWS as row (row)}
					<tr aria-hidden="true">
						<td class="d-none d-md-table-cell"><span class="skeleton" style="width: 4rem"></span></td>
						<td><span class="skeleton" style="width: 62%"></span></td>
						<td class="d-none d-md-table-cell"><span class="skeleton" style="width: 4.5rem"></span></td>
						<td class="d-none d-md-table-cell"><span class="skeleton" style="width: 3.5rem"></span></td>
						<td class="d-none d-xl-table-cell"><span class="skeleton" style="width: 4.5rem"></span></td>
						<td class="d-none d-lg-table-cell"><span class="skeleton" style="width: 5.5rem"></span></td>
						<td class="d-none d-lg-table-cell"><span class="skeleton ms-auto" style="width: 4rem"></span></td>
					</tr>
				{/each}
			</tbody>
		</Table>
	</div>
{:else if failed}
	<div class="border rounded p-3">
		<InlineStatus
			tone="error"
			message={feed.error ?? 'Could not load issues.'}
			action={retryInitial}
		/>
	</div>
{:else if empty}
	<div class="border rounded bg-body-tertiary px-3 py-5 text-center">
		<i class="bi bi-search fs-4 text-body-secondary d-block mb-2" aria-hidden="true"></i>
		<p class="fw-semibold mb-1">No issues match this view</p>
		<p class="small text-body-secondary mb-3">
			Try a different search term, or clear the active filters.
		</p>
		<Button color="outline-secondary" size="sm" onclick={() => onclear?.()}>Clear filters</Button>
	</div>
{:else}
	<div class="table-responsive border rounded">
		<Table hover class="align-middle mb-0">
			<thead class="table-light">
				<tr>
					<th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 5.5rem;">Issue</th>
					<th scope="col" class="small text-body-secondary">Title</th>
					<th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 7rem;">Status</th>
					<th scope="col" class="small text-body-secondary d-none d-md-table-cell" style="width: 6rem;">Priority</th>
					<th scope="col" class="small text-body-secondary d-none d-xl-table-cell" style="width: 8rem;">Planned</th>
					<th scope="col" class="small text-body-secondary d-none d-lg-table-cell" style="width: 9rem;">Assignee</th>
					<th scope="col" class="small text-body-secondary text-end d-none d-lg-table-cell" style="width: 7rem;">Updated</th>
				</tr>
			</thead>
			{#each groups as group (group.key)}
				{@const groupKey = `${groupBy}:${group.key}`}
				{@const collapsed = isGroupCollapsed(groupKey)}
				<tbody>
					<tr class="table-light">
						<th colspan="7" class="small fw-semibold text-body-secondary py-2">
							<button
								type="button"
								class="group-toggle btn btn-link btn-sm border-0 p-0 text-decoration-none text-reset text-wrap text-start fw-semibold"
								aria-expanded={!collapsed}
								onclick={() => toggleGroup(groupKey)}
							>
								{group.label} <span class="fw-normal ms-1">{group.issues.length}</span>
								<i
									class="group-chevron bi {collapsed
										? 'bi-chevron-right'
										: 'bi-chevron-down'} ms-1 small"
									aria-hidden="true"
								></i>
							</button>
						</th>
					</tr>
					{#if !collapsed}
						{#each group.issues as issue (`${issue.repoId}:${issue.number}`)}
							{@const labels = inlineLabels(labelsOf(issue))}
							<tr class="issue-row" onclick={(event) => onRowClick(event, issue)}>
								<td class="font-monospace small text-body-secondary text-nowrap d-none d-md-table-cell">
									{refOf(issue)}
								</td>
								<td>
									<div class="d-flex align-items-center gap-2">
										<a
											href={issuePath('issues', issue.repo, issue.number)}
											class="min-w-0 text-primary text-decoration-none text-break"
										>
											{titleOf(issue)}
										</a>
										{#if labels.shown.length > 0}
											<span class="d-inline-flex align-items-center gap-1 flex-shrink-0">
												{#each labels.shown as label (label)}
													<Badge color="light" class="border fw-normal text-body-secondary">
														{label}
													</Badge>
												{/each}
												{#if labels.overflow > 0}
													<Badge
														color="light"
														class="border fw-normal text-body-secondary"
														title={`${labels.overflow} more ${labels.overflow === 1 ? 'label' : 'labels'}`}
													>
														+{labels.overflow}
													</Badge>
												{/if}
											</span>
										{/if}
									</div>
									<div class="small text-body-secondary d-md-none mt-1 text-break">
										<span class="font-monospace">{refOf(issue)}</span>
										<span class="mx-1" aria-hidden="true">·</span>
										<StatusText
											status={issue.status}
											state={issue.state}
											blocked={issue.blocked}
										/>
										{#if issue.priority}
											<span class="mx-1" aria-hidden="true">·</span>
											<PriorityText priority={issue.priority} showName weight="normal" />
										{/if}
										{#if issue.planWeek}
											<span class="mx-1" aria-hidden="true">·</span>
											<span class="text-primary">
												<i class="bi bi-calendar-check me-1" aria-hidden="true"></i>Planned {planOf(issue)}
											</span>
										{/if}
										<span class="mx-1" aria-hidden="true">·</span>
										{#if assigneesOf(issue)}
											{assigneesOf(issue)}
										{:else}
											<span class="text-body-tertiary">Unassigned</span>
										{/if}
									</div>
								</td>
								<td class="small d-none d-md-table-cell">
									<StatusText
										status={issue.status}
										state={issue.state}
										blocked={issue.blocked}
									/>
								</td>
								<td class="small d-none d-md-table-cell">
									{#if issue.priority}
										<PriorityText priority={issue.priority} showName weight="normal" />
									{:else}
										<span class="text-body-tertiary">—</span>
									{/if}
								</td>
								<td class="small d-none d-xl-table-cell">
									{#if issue.planWeek}
										<span
											class="text-primary text-nowrap"
											title={`Planned for ${weekHeadline(issue.planWeek)}`}
										>
											<i class="bi bi-calendar-check me-1" aria-hidden="true"></i>{planOf(issue)}
										</span>
									{:else}
										<span class="text-body-tertiary">—</span>
									{/if}
								</td>
								<td class="small d-none d-lg-table-cell">
									{#if assigneesOf(issue)}
										{assigneesOf(issue)}
									{:else}
										<span class="text-body-tertiary">Unassigned</span>
									{/if}
								</td>
								<td
									class="small text-body-secondary text-end text-nowrap d-none d-lg-table-cell"
									title={new Date(issue.updatedAt).toLocaleString()}
								>
									{timeAgo(issue.updatedAt)}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			{/each}
		</Table>
	</div>

	{#if feed.error !== null}
		<div class="mt-2">
			<InlineStatus tone="error" message={feed.error} action={retryMore} />
		</div>
	{:else if feed.loading}
		<p class="small text-body-secondary mt-2 mb-0" role="status">Loading more…</p>
	{/if}

	<p class="small text-body-secondary mt-2 mb-0">
		{footerLabel}{#if repoScope} in {repoScope}{/if}
	</p>
{/if}

<div bind:this={sentinel} aria-hidden="true"></div>

<style>
	.issue-row {
		cursor: pointer;
	}

	/* The title link is the row's only keyboard stop, so it must stay obvious. */
	.issue-row a:focus-visible {
		outline: 2px solid var(--bs-primary);
		outline-offset: 2px;
		border-radius: 2px;
	}

	.skeleton {
		display: block;
		height: 0.75rem;
		border-radius: var(--bs-border-radius-sm);
		background: var(--bs-secondary-bg);
	}

	/* The group row stays as quiet as the approved table; the collapse
	   affordance appears on hover or keyboard focus. */
	.group-chevron {
		opacity: 0;
	}

	.group-toggle:hover .group-chevron,
	.group-toggle:focus-visible .group-chevron {
		opacity: 0.55;
	}

	@media (hover: none) {
		.group-chevron {
			opacity: 0.45;
		}
	}
</style>
