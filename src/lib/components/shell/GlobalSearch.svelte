<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { formatForDisplay } from '@tanstack/svelte-hotkeys';
	import { Button, InputGroup, InputGroupText } from '@sveltestrap/sveltestrap';
	import PriorityText from '#lib/components/common/PriorityText.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import { appHotkeys } from '#lib/client/hotkeys';
	import { setGroupBy } from '#lib/client/list-prefs.svelte';
	import {
		closeGlobalSearch,
		globalSearch
	} from '#lib/client/global-search.svelte';
	import { openQuickCreate } from '#lib/client/quick-create';
	import { issuePath } from '#lib/issue-url';
	import { issueRef } from '#lib/issue-ref';
	import type { SavedView } from '#lib/saved-views';
	import type { IssueListItem } from '#lib/server/issues/types';
	import {
		buildPaletteCommands,
		filterPaletteCommands,
		paletteFocusIndex,
		type PaletteCommand,
		type PaletteCommandGroup
	} from './commands';
	import { GLOBAL_SEARCH_PLACEHOLDER, globalSearchUrl } from './global-search';

	interface Props {
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
		/** Writers see the create command; readers only navigate and search. */
		mayWrite?: boolean;
		/** Visible saved views offered as palette commands. */
		savedViews?: SavedView[];
	}

	let { repoShortcodes = {}, mayWrite = false, savedViews = [] }: Props = $props();

	let query = $state('');
	let results = $state<IssueListItem[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let error = $state(false);
	let retry = $state(0);
	let input = $state<HTMLInputElement | null>(null);
	let panel = $state<HTMLElement | null>(null);

	let requestSeq = 0;

	/** Commands filtered by the same query as the issue search. */
	const commands = $derived(
		filterPaletteCommands(buildPaletteCommands({ mayWrite, savedViews }), query)
	);

	const commandGroups = $derived.by(() => {
		const order: PaletteCommandGroup[] = ['Navigate', 'Create', 'Saved views'];
		return order
			.map((group) => ({
				group,
				commands: commands.filter((command) => command.group === group)
			}))
			.filter((group) => group.commands.length > 0);
	});

	/** Catalog-derived key labels so the hint line cannot drift. */
	function keyHint(id: keyof typeof appHotkeys): string {
		const value = appHotkeys[id].hotkey;
		return typeof value === 'string' ? formatForDisplay(value) : '';
	}

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

	/** Every navigable element, commands first, then issue results. */
	const paletteItems = (): HTMLElement[] =>
		panel
			? Array.from(panel.querySelectorAll<HTMLElement>('[data-palette-item]'))
			: [];

	function focusItem(index: number): void {
		const items = paletteItems();
		if (items[index]) items[index].focus();
	}

	function openResult(issue: IssueListItem): void {
		closeGlobalSearch(false);
		void goto(issuePath('issues', issue.repo, issue.number));
	}

	function selectCommand(command: PaletteCommand): void {
		closeGlobalSearch(false);
		if (command.action === 'create-issue') {
			openQuickCreate();
			return;
		}
		if (!command.href) return;
		const view = savedViews.find((candidate) => `view:${candidate.id}` === command.id);
		if (view?.group) setGroupBy(view.group);
		void goto(command.href);
	}

	/** A modified click keeps native new-tab behaviour; the router handles the rest. */
	function onCommandClick(event: MouseEvent, command: PaletteCommand): void {
		if (command.action === 'create-issue') {
			event.preventDefault();
			selectCommand(command);
			return;
		}
		const view = savedViews.find((candidate) => `view:${candidate.id}` === command.id);
		if (view?.group) setGroupBy(view.group);
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		closeGlobalSearch(false);
	}

	function clearQuery(): void {
		query = '';
		input?.focus();
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closeGlobalSearch();
			return;
		}

		if (event.key === 'Enter' && event.target === input) {
			// Keep the original contract: Enter from the input opens the first
			// issue result. ArrowDown reaches the command list before that.
			const first = results[0];
			if (first) {
				event.preventDefault();
				openResult(first);
				return;
			}
			const item = paletteItems()[0];
			if (item) {
				event.preventDefault();
				item.click();
			}
			return;
		}

		const items = paletteItems();
		const current = items.indexOf(document.activeElement as HTMLElement);
		const next = paletteFocusIndex(event.key, current, items.length);
		if (next === null) return;
		if (!items.includes(document.activeElement as HTMLElement) && event.target !== input) return;

		event.preventDefault();
		focusItem(next);
	}
</script>

{#if globalSearch.open}
	<!-- The panel is a labelled search region, but the shared keyboard contract
	     (Escape/arrows/Enter) lives on the region so focus can start on the
	     input, the Close control, or a command/result row. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<section
		bind:this={panel}
		id="global-search-panel"
		class="global-search bg-body-tertiary border-bottom"
		aria-label="Command palette and issue search"
		onkeydown={onKeydown}
	>
		<div class="container-xl py-3">
			<div class="d-flex align-items-center justify-content-between gap-2 mb-2">
				<h2 class="h6 mb-0">Search or run a command</h2>
				<Button color="link" size="sm" class="text-decoration-none" onclick={() => closeGlobalSearch()}>
					Close
				</Button>
			</div>

			<InputGroup size="sm">
				<InputGroupText class="bg-body">
					<i class="bi bi-search" aria-hidden="true"></i>
				</InputGroupText>
				<label class="visually-hidden" for="global-search-input">Search issues or commands</label>
				<input
					bind:this={input}
					id="global-search-input"
					type="search"
					class="form-control search-with-clear"
					placeholder={GLOBAL_SEARCH_PLACEHOLDER}
					aria-label="Search issues or commands by title, body, comments, or name"
					autocomplete="off"
					value={query}
					oninput={(event) => (query = event.currentTarget.value)}
				/>
				{#if query}
					<Button color="outline-secondary" aria-label="Clear search" onclick={clearQuery}>
						<i class="bi bi-x-lg" aria-hidden="true"></i>
					</Button>
				{/if}
			</InputGroup>

			<p class="visually-hidden" role="status">
				{#if loading}
					Searching
				{:else if error}
					Search is unavailable
				{:else}
					{commands.length} {commands.length === 1 ? 'command' : 'commands'}, {total}
					{total === 1 ? 'issue result' : 'issue results'}
				{/if}
			</p>

			{#if commandGroups.length > 0}
				<div class="mt-2">
					{#each commandGroups as group (group.group)}
						<h3 class="small fw-semibold text-body-secondary mt-2 mb-1">{group.group}</h3>
						<ul class="list-group list-group-flush border rounded" aria-label={`${group.group} commands`}>
							{#each group.commands as command (command.id)}
								<li class="list-group-item p-0">
									{#if command.action === 'create-issue'}
										<button
											type="button"
											class="list-group-item-action d-flex align-items-center gap-2 px-3 py-2 w-100 border-0 bg-transparent text-start"
											data-palette-item
											onclick={(event) => onCommandClick(event, command)}
										>
											<i class="bi {command.icon} text-body-secondary" aria-hidden="true"></i>
											<span>{command.label}</span>
										</button>
									{:else}
										<a
											class="list-group-item-action d-flex align-items-center gap-2 px-3 py-2 text-body text-decoration-none"
											href={command.href}
											data-palette-item
											onclick={(event) => onCommandClick(event, command)}
										>
											<i class="bi {command.icon} text-body-secondary" aria-hidden="true"></i>
											<span>{command.label}</span>
											{#if command.requiresWrite}
												<span class="visually-hidden">(writers only)</span>
											{/if}
										</a>
									{/if}
								</li>
							{/each}
						</ul>
					{/each}
				</div>
			{/if}

			<div class="mt-2">
				<h3 class="small fw-semibold text-body-secondary mt-2 mb-1">Issues</h3>
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
									data-palette-item
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

			<p class="small text-body-secondary mt-3 mb-0 d-flex flex-wrap align-items-center gap-3">
				<span>
					<kbd>{keyHint('list.next')}</kbd>/<kbd>{keyHint('list.previous')}</kbd> Move
				</span>
				<span><kbd>{keyHint('list.open')}</kbd> Open</span>
				<span><kbd>{keyHint('list.dismiss')}</kbd> Close</span>
				<span><kbd>{keyHint('nav.search')}</kbd> Search</span>
			</p>
		</div>
	</section>
{/if}
