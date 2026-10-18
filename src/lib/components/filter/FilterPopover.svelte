<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
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
	}

	let { options, allowNoStatus = true }: Props = $props();

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
		...PRIORITY_OPTIONS,
		{ value: NONE, label: 'No priority', color: null }
	]);
	const sizeOptions = $derived([...SIZE_OPTIONS, { value: NONE, label: 'No size', color: null }]);

	let open = $state(false);
	let panel = $state<HTMLElement | null>(null);
	let trigger = $state<HTMLElement | null>(null);

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
			statuses: [],
			// Keep the All/Mine scope: the popover does not own `assignee=me`.
			assignees: filter.assignees.filter((value) => value === ME),
			priorities: [],
			sizes: [],
			labels: [],
			search: filter.search
		});
	}

	// Outside-interaction detection runs on `pointerdown`, matching bits-ui's own
	// floating layers. A `click` listener would react after nested menus have
	// already changed the DOM / pointer-events, so the target may no longer
	// reflect what the user actually pressed.
	function onWindowPointerDown(event: PointerEvent) {
		if (!open) return;
		const target = event.target as Node;
		if (panel?.contains(target) || trigger?.contains(target)) return;
		// Keep the panel open while the user is picking inside a portaled menu.
		if (
			target instanceof Element &&
			target.closest('[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-trigger"]')
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

<div class="relative shrink-0">
	<Button
		variant="outline"
		size="sm"
		bind:ref={trigger}
		aria-expanded={open}
		aria-haspopup="true"
		class={count > 0 ? 'border-primary text-foreground' : undefined}
		onclick={() => (open = !open)}
	>
		<FilterIcon data-icon="inline-start" />
		<span>Filter</span>
		{#if count > 0}
			<Badge variant="secondary" class="mono h-4 min-w-4 rounded-full px-1 text-[0.625rem]">
				{count}
			</Badge>
		{/if}
	</Button>

	{#if open}
		<div
			class="bg-popover text-popover-foreground absolute top-[calc(100%+6px)] right-0 z-30 flex w-65 flex-col gap-2 border p-2 shadow-md"
			bind:this={panel}
		>
			<div class="flex items-center justify-between">
				<span class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
					Filters
				</span>
				{#if count > 0}
					<Button variant="link" size="xs" onclick={clearAll}>Clear</Button>
				{/if}
			</div>
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
			</div>
		</div>
	{/if}
</div>
