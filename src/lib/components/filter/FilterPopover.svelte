<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import { PRIORITY_OPTIONS, SIZE_OPTIONS, STATUS_OPTIONS } from '#lib/labels';
	import type { FilterOptions } from '#lib/server/issues/types';
	import {
		activeFilterCount,
		buildFilterUrl,
		NONE,
		parseFilterParams,
		type ClientFilter
	} from '#lib/url-filter';
	import IconFilter from '~icons/carbon/filter';

	/**
	 * Compact, single-trigger filter control for the narrow feed column
	 * (docs/DESIGN.md §Layout). Collapses the six multi-selects behind a
	 * "Filter" button so the 300px master list stays legible.
	 */
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

	let open = $state(false);
	let panel = $state<HTMLElement | null>(null);
	let trigger = $state<HTMLElement | null>(null);

	function apply(next: ClientFilter) {
		void goto(
			buildFilterUrl(page.url.pathname, page.url.searchParams, next),
			{ reset: false }
		);
	}

	// Merge a single dimension while preserving the current query string.
	function set<K extends keyof ClientFilter>(key: K, value: ClientFilter[K]) {
		apply({ ...filter, search: filter.search, [key]: value });
	}

	function clearAll() {
		apply({
			repos: [],
			statuses: [],
			assignees: [],
			priorities: [],
			sizes: [],
			labels: [],
			search: filter.search
		});
	}

	// Outside-interaction detection runs on `pointerdown`, matching bits-ui's
	// own floating layers (`onInteractOutside`). A `click` listener would react
	// after nested menus have already changed the DOM / pointer-events, so the
	// target may no longer reflect what the user actually pressed.
	function onWindowPointerDown(event: PointerEvent) {
		if (!open) return;
		const target = event.target as Node;
		if (panel?.contains(target) || trigger?.contains(target)) return;
		// Keep the panel open while the user is picking inside a portaled menu.
		if (
			target instanceof Element &&
			target.closest('.ms-content, .ms-trigger')
		) {
			return;
		}
		open = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') open = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onKeydown} />

<div class="filter">
	<button
		class="filter__trigger"
		class:filter__trigger--active={count > 0}
		type="button"
		bind:this={trigger}
		aria-expanded={open}
		aria-haspopup="true"
		onclick={() => (open = !open)}
	>
		<IconFilter width={14} height={14} />
		<span>Filter</span>
		{#if count > 0}
			<span class="filter__count mono">{count}</span>
		{/if}
	</button>

	{#if open}
		<div class="filter__panel" bind:this={panel}>
			<div class="filter__panel-head">
				<span class="filter__panel-title">Filters</span>
				{#if count > 0}
					<button class="filter__clear" type="button" onclick={clearAll}>Clear</button>
				{/if}
			</div>
			<div class="filter__grid">
				<MultiSelect
					label="Repo"
					options={repoOptions}
					selected={filter.repos}
					onselect={(values) => set('repos', values)}
				/>
				<MultiSelect
					label="Status"
					options={statusOptions}
					selected={filter.statuses}
					onselect={(values) => set('statuses', values)}
				/>
				<MultiSelect
					label="Assignee"
					options={assigneeOptions}
					pinned={['me']}
					selected={filter.assignees}
					onselect={(values) => set('assignees', values)}
				/>
				<MultiSelect
					label="Priority"
					options={priorityOptions}
					selected={filter.priorities}
					onselect={(values) => set('priorities', values)}
				/>
				<MultiSelect
					label="Size"
					options={sizeOptions}
					selected={filter.sizes}
					onselect={(values) => set('sizes', values)}
				/>
				<MultiSelect
					label="Labels"
					options={labelOptions}
					selected={filter.labels}
					onselect={(values) => set('labels', values)}
				/>
			</div>
		</div>
	{/if}
</div>

<style>
	.filter {
		position: relative;
		flex: none;
	}

	.filter__trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		height: 26px;
		padding: 0 var(--space-sm);
		background: var(--color-surface-layer-1);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		cursor: pointer;
		transition:
			background var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.filter__trigger:hover {
		background: var(--color-surface-layer-2);
	}

	.filter__trigger--active {
		border-color: var(--color-primary);
		color: var(--color-text-primary);
	}

	.filter__count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: var(--radius-full);
		background: var(--color-primary);
		color: var(--color-on-primary);
		font-size: 10px;
		font-weight: var(--weight-semibold);
	}

	/* In-flow, anchored panel (not a portal) so the nested multi-select menus
	   keep working without focus-trap conflicts. */
	.filter__panel {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 30;
		width: 260px;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		padding: var(--space-sm);
		background: var(--color-surface-overlay-translucent);
		backdrop-filter: blur(var(--backdrop-blur));
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-overlay);
	}

	.filter__panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.filter__panel-title {
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.filter__clear {
		background: transparent;
		border: none;
		padding: 0;
		color: var(--color-primary);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.filter__clear:hover {
		text-decoration: underline;
	}

	.filter__grid {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
	}
</style>
