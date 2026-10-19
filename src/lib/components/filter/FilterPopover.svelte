<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Badge } from '#lib/components/ui/badge';
	import { Button, buttonVariants } from '#lib/components/ui/button';
	import * as Popover from '#lib/components/ui/popover';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import { cn } from '#lib/utils';
	import { SIZE_OPTIONS, STATUS_OPTIONS } from '#lib/labels';
	import { PRIORITY_SCALE } from '#lib/priority';
	import type { FilterOptions } from '#lib/server/issues/types';
	import {
		activeFilterCount,
		buildFilterUrl,
		NONE,
		parseFilterParams,
		type ClientFilter
	} from '#lib/url-filter';
	import FilterIcon from '@lucide/svelte/icons/filter';

	/**
	 * Compact, single-trigger filter control for the narrow feed column.
	 * Collapses the six multi-selects behind a "Filter" button so the master list
	 * stays legible.
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
	const count = $derived(activeFilterCount({ ...filter, assignees: scopedAssignees }));

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
		class={cn(
			buttonVariants({ variant: 'outline', size: 'sm' }),
			count > 0 && 'border-primary text-foreground'
		)}
	>
		<FilterIcon data-icon="inline-start" />
		<span>Filter</span>
		{#if count > 0}
			<Badge variant="secondary" class="mono h-4 min-w-4 rounded-full px-1 text-[0.625rem]">
				{count}
			</Badge>
		{/if}
	</Popover.Trigger>

	<Popover.Content align="end" class="w-65 gap-2 p-2" {onInteractOutside}>
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
				Filters
			</span>
			{#if count > 0}
				<Button variant="link" size="xs" onclick={clearAll}>Clear</Button>
			{/if}
		</div>
		{#if showState}
			<div class="flex items-center justify-between">
				<span class="text-muted-foreground text-xs">State</span>
				<div class="border-[color:var(--surface-divider)] flex overflow-hidden rounded-md border">
					{#each STATE_OPTIONS as option (option.value)}
						<button
							type="button"
							class={cn(
								'px-2 py-0.5 text-xs transition-colors',
								currentState === option.value
									? 'bg-accent text-foreground'
									: 'text-muted-foreground hover:bg-accent/60'
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
		<div class="flex flex-wrap gap-1">
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
