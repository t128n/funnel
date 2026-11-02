<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as Popover from '#lib/components/ui/popover';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import { SIZE_OPTIONS, STATUS_OPTIONS } from '#lib/labels';
	import { PRIORITY_SCALE } from '#lib/priority';
	import type { FilterOptions } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import ListFilterIcon from '@lucide/svelte/icons/list-filter';
	import {
		activeFilterCount,
		buildFilterUrl,
		NONE,
		parseFilterParams,
		type ClientFilter
	} from '#lib/url-filter';

	/**
	 * Compact, single-trigger filter control for the narrow feed column.
	 * Collapses the six multi-selects behind a `Filters` button so the master
	 * list stays legible. The long-tail dimensions live here; the primary
	 * controls stay visible in the toolbar.
	 */
	interface Props {
		options: FilterOptions;
		/** The Issues view turns this off: it lists triaged issues only. */
		allowNoStatus?: boolean;
		/** Offer the Open / Closed / All state switch (folded in from the header). */
		showState?: boolean;
	}

	let { options, allowNoStatus = true, showState = false }: Props = $props();

	const filter = $derived(parseFilterParams(page.url.searchParams));

	// "Me" is owned by the All/Mine scope switch (ViewSegment), so the Assignee
	// multi-select only offers other people and ignores the scope when it counts
	// active filters. Selecting a specific person replaces the scope.
	const ME = 'me';
	const scopedAssignees = $derived(filter.assignees.filter((value) => value !== ME));
	const count = $derived(
		activeFilterCount({
			...filter,
			// State lives in the page-header scope switch, not this panel, unless
			// the panel explicitly owns it (Matrix).
			states: showState ? filter.states : [],
			assignees: scopedAssignees
		})
	);

	const repoOptions = $derived(
		options.repos.map((repo) => ({ value: repo.slug, label: repo.slug }))
	);
	const assigneeOptions = $derived(
		options.assignees.map((user) => ({ value: user.login, label: user.login }))
	);
	const labelOptions = $derived(options.labels.map((name) => ({ value: name, label: name })));
	const milestoneOptions = $derived([
		...options.milestones.map((milestone) => ({
			value: `${milestone.repo}#${milestone.number}`,
			label: milestone.title
				? `${milestone.title} · ${milestone.repo.split('/')[1]}`
				: `${milestone.repo}#${milestone.number}`
		})),
		{ value: NONE, label: 'No milestone' }
	]);

	const statusOptions = $derived([
		...STATUS_OPTIONS,
		...(allowNoStatus ? [{ value: NONE, label: 'No status', color: null }] : [])
	]);
	// The Issues view never offers `none`, so a stale `?status=none` must not
	// render an unknown chip in the trigger.
	const selectedStatuses = $derived(
		allowNoStatus ? filter.statuses : filter.statuses.filter((value) => value !== NONE)
	);
	const priorityOptions = $derived([
		...PRIORITY_SCALE.map((level) => ({
			value: level.value.toLowerCase(),
			label: `${level.value} · ${level.name}`,
			color: level.color
		})),
		{ value: NONE, label: 'No priority', color: null }
	]);
	const sizeOptions = $derived([...SIZE_OPTIONS, { value: NONE, label: 'No size', color: null }]);

	let open = $state(false);

	/**
	 * State switch (formerly the header's Open / Closed / All segment). The
	 * server defaults to `open` when no `state` param is present, so "Open"
	 * serializes as an empty dimension and only the non-default views add a key.
	 */
	type StateView = 'open' | 'closed' | 'all';
	const currentState = $derived.by((): StateView => {
		const set = new Set(filter.states);
		if (set.has('open') && set.has('closed')) return 'all';
		if (set.has('closed')) return 'closed';
		return 'open';
	});
	const STATE_OPTIONS: { value: StateView; label: string }[] = [
		{ value: 'open', label: 'Open' },
		{ value: 'closed', label: 'Closed' },
		{ value: 'all', label: 'All' }
	];

	function setState(next: StateView) {
		set('states', next === 'all' ? ['open', 'closed'] : next === 'closed' ? ['closed'] : []);
	}

	function apply(next: ClientFilter) {
		void goto(buildFilterUrl(page.url.pathname, page.url.searchParams, next), { reset: false });
	}

	// Merge a single dimension while preserving the current query string.
	function set<K extends keyof ClientFilter>(key: K, value: ClientFilter[K]) {
		apply({ ...filter, search: filter.search, [key]: value });
	}

	function clearAll() {
		apply({
			repos: [],
			states: [],
			statuses: [],
			// Keep the All/Mine scope: the popover does not own `assignee=me`.
			assignees: filter.assignees.filter((value) => value === ME),
			priorities: [],
			sizes: [],
			labels: [],
			milestones: [],
			search: filter.search
		});
	}

	/**
	 * Keep the panel open while a nested menu is in use. The multi-selects render
	 * their lists in a portal, so a click there reads as "outside" this popover;
	 * bits-ui itself guards floating layers the same way.
	 */
	function onInteractOutside(event: PointerEvent) {
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest(
				'[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-trigger"], [data-slot="popover-content"], [data-slot="command"]'
			)
		) {
			event.preventDefault();
		}
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="inline-flex h-(--size-control-md) shrink-0 items-center gap-1.5 rounded-sm border border-border-strong bg-canvas px-3 text-body text-fg-secondary hover:bg-surface hover:text-fg data-[state=open]:bg-surface-2 data-[state=open]:text-fg"
	>
		<ListFilterIcon class="size-4 shrink-0" aria-hidden="true" />
		<span>Filters</span>
		{#if count > 0}
			<span class="tabular-nums text-fg">{count}</span>
		{/if}
	</Popover.Trigger>

	<Popover.Content
		align="end"
		class="w-80 max-w-[calc(100vw-2rem)] gap-3 p-3"
		{onInteractOutside}
	>
		<div class="flex items-center justify-between gap-3">
			<span class="text-body font-semibold text-fg">Filters</span>
			{#if count > 0}
				<button type="button" class="link text-caption" onclick={clearAll}>Clear</button>
			{/if}
		</div>
		{#if showState}
			<div class="flex flex-col gap-1">
				<span class="text-caption font-semibold text-fg-secondary">State</span>
				<div class="inline-flex overflow-hidden rounded-sm border border-border-strong">
					{#each STATE_OPTIONS as option, index (option.value)}
						<button
							type="button"
							class={cn(
								'inline-flex h-(--size-control-sm) flex-1 items-center justify-center px-2 text-body',
								index > 0 && 'border-l border-border-subtle',
								currentState === option.value
									? 'bg-surface-2 font-semibold text-fg'
									: 'text-fg-secondary hover:bg-surface hover:text-fg'
							)}
							aria-pressed={currentState === option.value}
							onclick={() => setState(option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}
		<div class="flex flex-wrap gap-2">
			<MultiSelect
				label="Repo"
				options={repoOptions}
				selected={filter.repos}
				onselect={(values) => set('repos', values)}
			/>
			<MultiSelect
				label="Status"
				options={statusOptions}
				selected={selectedStatuses}
				onselect={(values) => set('statuses', values)}
			/>
			<MultiSelect
				label="Assignee"
				options={assigneeOptions}
				selected={scopedAssignees}
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
			<MultiSelect
				label="Milestone"
				options={milestoneOptions}
				selected={filter.milestones}
				onselect={(values) => set('milestones', values)}
			/>
		</div>
	</Popover.Content>
</Popover.Root>
