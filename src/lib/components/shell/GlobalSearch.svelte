<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { Button, InputGroup, InputGroupText } from '@sveltestrap/sveltestrap';
	import PriorityText from '#lib/components/common/PriorityText.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import {
		closeGlobalSearch,
		globalSearch,
		openGlobalSearch
	} from '#lib/client/global-search.svelte';
	import { issuePath } from '#lib/issue-url';
	import { issueRef } from '#lib/issue-ref';
	import type { IssueListItem } from '#lib/server/issues/types';
	import { GLOBAL_SEARCH_PLACEHOLDER, globalSearchUrl } from './global-search';

	interface Props {
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
	}

	let { repoShortcodes = {} }: Props = $props();

	let query = $state('');
	let results = $state<IssueListItem[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let error = $state(false);
	let retry = $state(0);
	let input = $state<HTMLInputElement | null>(null);
	let panel = $state<HTMLElement | null>(null);

	let requestSeq = 0;

	$effect(() => {
		if (!globalSearch.open) {
			query = '';
			results = [];
			total = 0;
			loading = false;
			error = false;
			return;
		}
		const node = input;
		void tick().then(() => node?.focus());
	});

	// One fetch per settled query. The panel always uses the issues feed with no
	// repository parameter, so results cross every mirrored repository.
	$effect(() => {
		if (!globalSearch.open) return;
		const currentQuery = query;
		const attempt = retry;
		const seq = ++requestSeq;
		const controller = new AbortController();
		const delay = currentQuery.trim().length > 0 ? 200 : 0;
		loading = true;
		error = false;

		const timer = setTimeout(() => {
			void (async () => {
				try {
					const response = await fetch(globalSearchUrl(currentQuery), {
						signal: controller.signal,
						headers: { accept: 'application/json' }
					});
					if (!response.ok) throw new Error(`Search failed: ${response.status}`);
					const page = (await response.json()) as {
						items?: IssueListItem[];
						total?: number;
					};
					if (seq !== requestSeq || attempt !== retry) return;
					results = page.items ?? [];
					total = page.total ?? results.length;
				} catch (cause) {
					if (controller.signal.aborted || seq !== requestSeq || attempt !== retry) return;
					results = [];
					total = 0;
					error = true;
				} finally {
					if (seq === requestSeq && attempt === retry) loading = false;
				}
			})();
		}, delay);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	// Navigating elsewhere (including Back) dismisses the panel rather than
	// leaving stale results over a different page.
	afterNavigate(({ from, to }) => {
		if (from && to && from.url.href !== to.url.href && globalSearch.open) {
			closeGlobalSearch(false);
		}
	});

	const resultLinks = (): HTMLElement[] =>
		panel
			? Array.from(panel.querySelectorAll<HTMLElement>('[data-global-search-result]'))
			: [];

	function focusResult(index: number): void {
		const links = resultLinks();
		if (links[index]) links[index].focus();
	}

	function openResult(issue: IssueListItem): void {
		closeGlobalSearch(false);
		void goto(issuePath('issues', issue.repo, issue.number));
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closeGlobalSearch();
			return;
		}

		if (event.key === 'Enter' && event.target === input) {
			const first = results[0];
			if (!first) return;
			event.preventDefault();
			openResult(first);
			return;
		}

		if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

		const links = resultLinks();
		if (links.length === 0) return;
		const current = links.indexOf(document.activeElement as HTMLElement);

		if (!links.includes(document.activeElement as HTMLElement)) {
			if (event.target !== input) return;
			event.preventDefault();
			focusResult(event.key === 'End' ? links.length - 1 : 0);
			return;
		}

		event.preventDefault();
		if (event.key === 'Home') focusResult(0);
		else if (event.key === 'End') focusResult(links.length - 1);
		else if (event.key === 'ArrowDown') focusResult((current + 1) % links.length);
		else focusResult((current - 1 + links.length) % links.length);
	}
</script>

{#if globalSearch.open}
	<!-- The panel is a labelled search region, but the shared keyboard contract
	     (Escape/arrows/Enter) lives on the region so focus can start on the
	     input, the Close control, or a result row. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<section
		bind:this={panel}
		id="global-search-panel"
		class="global-search bg-body-tertiary border-bottom"
		aria-label="Global issue search"
		onkeydown={onKeydown}
	>
		<div class="container-xl py-3">
			<div class="d-flex align-items-center justify-content-between gap-2 mb-2">
				<h2 class="h6 mb-0">Search issues</h2>
				<Button color="link" size="sm" class="text-decoration-none" onclick={() => closeGlobalSearch()}>
					Close
				</Button>
			</div>

			<InputGroup size="sm">
				<InputGroupText class="bg-body">
					<i class="bi bi-search" aria-hidden="true"></i>
				</InputGroupText>
				<label class="visually-hidden" for="global-search-input">Search all issues</label>
				<input
					bind:this={input}
					id="global-search-input"
					type="search"
					class="form-control"
					placeholder={GLOBAL_SEARCH_PLACEHOLDER}
					aria-label="Search all issues by title, body, or comments"
					autocomplete="off"
					value={query}
					oninput={(event) => (query = event.currentTarget.value)}
				/>
			</InputGroup>

			<p class="visually-hidden" role="status">
				{#if loading}
					Searching
				{:else if error}
					Search is unavailable
				{:else}
					{total} {total === 1 ? 'result' : 'results'}
				{/if}
			</p>

			<div class="mt-2">
				{#if loading}
					<div class="d-flex align-items-center gap-2 small text-body-secondary" role="status">
						<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
						Searching…
					</div>
				{:else if error}
					<div class="alert alert-danger py-2 mb-0 d-flex align-items-center gap-2" role="alert">
						<span>Search is unavailable.</span>
						<Button color="link" size="sm" class="alert-link p-0" onclick={() => (retry += 1)}>
							Try again
						</Button>
					</div>
				{:else if results.length === 0}
					<p class="small text-body-secondary mb-0" role="status">
						{#if query.trim()}
							No issues match “{query.trim()}”. Search looks in titles, bodies, and comments.
						{:else}
							No recent issues to show.
						{/if}
					</p>
				{:else}
					<ul class="list-group list-group-flush border rounded" aria-label="Search results">
						{#each results as issue (issue.repo + '#' + issue.number)}
							<li class="list-group-item p-0">
								<a
									class="list-group-item-action d-flex flex-wrap align-items-center gap-2 px-3 py-2 text-body text-decoration-none"
									href={issuePath('issues', issue.repo, issue.number)}
									data-global-search-result
									onclick={() => closeGlobalSearch(false)}
								>
									<span class="font-monospace small fw-semibold text-nowrap">
										{issueRef(issue.repo, issue.number, repoShortcodes)}
									</span>
									<span class="small text-body-secondary text-truncate">{issue.repo}</span>
									<span class="flex-grow-1 text-truncate">{issue.title.trim() || 'Untitled'}</span>
									<StatusText status={issue.status} state={issue.state} blocked={issue.blocked} />
									<PriorityText priority={issue.priority} />
								</a>
							</li>
						{/each}
					</ul>
					{#if query.trim()}
						<p class="small text-body-secondary mt-2 mb-0">
							Showing {results.length} of {total} matching {total === 1 ? 'issue' : 'issues'}.
						</p>
					{:else}
						<p class="small text-body-secondary mt-2 mb-0">Most recently updated issues.</p>
					{/if}
				{/if}
			</div>
		</div>
	</section>
{/if}
