<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import { PRIORITY_OPTIONS, SIZE_OPTIONS, STATUS_OPTIONS } from '#lib/labels';
	import type { FilterOptions } from '#lib/server/issues/types';
	import {
		activeFilterCount,
		buildFilterUrl,
		NONE,
		parseFilterParams,
		toggleValue,
		type ClientFilter
	} from '#lib/url-filter';

	interface Props {
		options: FilterOptions;
	}

	let { options }: Props = $props();

	const filter = $derived(parseFilterParams(page.url.searchParams));
	const count = $derived(activeFilterCount(filter));

	const repoOptions = $derived(
		options.repos.map((repo) => ({ value: repo.slug, label: repo.slug }))
	);
	const assigneeOptions = $derived([
		{ value: 'me', label: 'Me' },
		...options.assignees.map((user) => ({ value: user.login, label: user.login }))
	]);
	const labelOptions = $derived(
		options.labels.map((name) => ({ value: name, label: name }))
	);

	const statusOptions = $derived([
		...STATUS_OPTIONS,
		{ value: NONE, label: 'No status', color: null }
	]);
	const priorityOptions = $derived([
		...PRIORITY_OPTIONS,
		{ value: NONE, label: 'No priority', color: null }
	]);
	const sizeOptions = $derived([
		...SIZE_OPTIONS,
		{ value: NONE, label: 'No size', color: null }
	]);

	// Local search state; synced from the URL whenever the input is not focused
	// so external navigations (clearing chips, back/forward) reflect here.
	let search = $state(untrack(() => filter.search));
	let searchFocused = $state(false);
	let debounce: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const fromUrl = filter.search;
		if (!searchFocused && fromUrl !== search) search = fromUrl;
	});

	function apply(next: ClientFilter) {
		const target = buildFilterUrl(
			page.url.pathname,
			page.url.searchParams,
			next
		);
		void goto(target, { reset: false });
	}

	function onSearchInput(value: string) {
		search = value;
		clearTimeout(debounce);
		debounce = setTimeout(() => apply({ ...filter, search: value }), 250);
	}

	function clearAll() {
		clearTimeout(debounce);
		search = '';
		apply({
			repos: [],
			statuses: [],
			assignees: [],
			priorities: [],
			sizes: [],
			labels: [],
			search: ''
		});
	}
</script>

<div class="filter-bar">
	<div class="filter-bar__selects">
		<MultiSelect
			label="Repo"
			options={repoOptions}
			selected={filter.repos}
			onselect={(values) => apply({ ...filter, repos: values })}
		/>
		<MultiSelect
			label="Status"
			options={statusOptions}
			selected={filter.statuses}
			onselect={(values) => apply({ ...filter, statuses: values })}
		/>
		<MultiSelect
			label="Assignee"
			options={assigneeOptions}
			pinned={['me']}
			selected={filter.assignees}
			onselect={(values) => apply({ ...filter, assignees: values })}
		/>
		<MultiSelect
			label="Priority"
			options={priorityOptions}
			selected={filter.priorities}
			onselect={(values) => apply({ ...filter, priorities: values })}
		/>
		<MultiSelect
			label="Size"
			options={sizeOptions}
			selected={filter.sizes}
			onselect={(values) => apply({ ...filter, sizes: values })}
		/>
		<MultiSelect
			label="Labels"
			options={labelOptions}
			selected={filter.labels}
			onselect={(values) => apply({ ...filter, labels: values })}
		/>
	</div>

	<div class="filter-bar__search">
		<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
			<path
				d="M7 12A5 5 0 107 2a5 5 0 000 10zm3.5-1.5L14 14"
				fill="none"
				stroke="currentColor"
				stroke-width="1.4"
				stroke-linecap="round"
			/>
		</svg>
		<input
			id="issue-search"
			type="search"
			placeholder="Search title, body, comments…"
			value={search}
			oninput={(e) => onSearchInput(e.currentTarget.value)}
			onfocus={() => (searchFocused = true)}
			onblur={() => (searchFocused = false)}
			aria-label="Search issues"
		/>
	</div>

	{#if count > 0}
		<button class="clear" type="button" onclick={clearAll}>
			{count} filter{count === 1 ? '' : 's'} · Clear
		</button>
	{/if}
</div>

<style>
	.filter-bar {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		height: var(--island-header-height);
		padding: 0 var(--space-md);
		flex: none;
	}

	.filter-bar__selects {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		overflow-x: auto;
		scrollbar-width: none;
	}

	.filter-bar__selects::-webkit-scrollbar {
		display: none;
	}

	.filter-bar__search {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		margin-left: auto;
		height: 26px;
		padding: 0 var(--space-sm);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		min-width: 200px;
	}

	.filter-bar__search:focus-within {
		border-color: var(--color-primary);
	}

	.filter-bar__search input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		font-size: var(--text-sm);
		color: var(--color-text-primary);
	}

	.clear {
		height: 26px;
		padding: 0 var(--space-sm);
		background: color-mix(in srgb, var(--color-primary) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-primary) 40%, transparent);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		cursor: pointer;
		white-space: nowrap;
	}

	.clear:hover {
		color: var(--color-text-primary);
	}
</style>
