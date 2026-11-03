<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Button, ButtonGroup, Offcanvas } from '@sveltestrap/sveltestrap';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import { focusTrap } from '#lib/client/focus-trap';
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

	/**
	 * Compact filter control for the narrow feed column. Collapses the six
	 * multi-selects into an offcanvas so the master list stays legible. The
	 * long-tail dimensions live here; the primary controls stay in the toolbar.
	 */
	interface Props {
		options: FilterOptions;
		/** The Issues view turns this off: it lists triaged issues only. */
		allowNoStatus?: boolean;
		/** Offer the Open / Closed / All state switch (folded in from the header). */
		showState?: boolean;
	}

	let { options, allowNoStatus = true, showState = false }: Props = $props();

	let open = $state(false);

	const filter = $derived(parseFilterParams(page.url.searchParams));

	// "Me" is owned by the All/Mine scope switch (ViewSegment), so the Assignee
	// multi-select only offers other people and ignores the scope when it counts
	// active filters.
	const ME = 'me';
	const scopedAssignees = $derived(filter.assignees.filter((value) => value !== ME));
	const count = $derived(
		activeFilterCount({
			...filter,
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

	function apply(next: ClientFilter) {
		void goto(buildFilterUrl(page.url.pathname, page.url.searchParams, next), { reset: false });
	}

	function set<K extends keyof ClientFilter>(key: K, value: ClientFilter[K]) {
		apply({ ...filter, search: filter.search, [key]: value });
	}

	function setState(next: StateView) {
		set('states', next === 'all' ? ['open', 'closed'] : next === 'closed' ? ['closed'] : []);
	}

	function clearAll() {
		apply({
			repos: [],
			states: [],
			statuses: [],
			assignees: filter.assignees.filter((value) => value === ME),
			priorities: [],
			sizes: [],
			labels: [],
			milestones: [],
			search: filter.search
		});
	}

	function toggle() {
		open = !open;
	}
</script>

<Button color="outline-secondary" size="sm" onclick={() => (open = true)}>
	<i class="bi bi-funnel me-1" aria-hidden="true"></i>
	Filters
	{#if count > 0}
		<span class="badge text-bg-secondary ms-1">{count}</span>
	{/if}
</Button>

<Offcanvas isOpen={open} {toggle} placement="end" header="Filters" body={false}>
	<div class="d-flex flex-column gap-3 p-3" use:focusTrap={open}>
		<div class="d-flex align-items-center justify-content-between gap-3">
			<span class="fw-semibold">Filters</span>
			{#if count > 0}
				<Button color="link" size="sm" onclick={clearAll}>Clear</Button>
			{/if}
		</div>

		{#if showState}
			<div class="d-flex flex-column gap-1">
				<span class="small fw-semibold text-body-secondary">State</span>
				<ButtonGroup size="sm">
					{#each STATE_OPTIONS as option (option.value)}
						<Button
							color="outline-secondary"
							size="sm"
							active={currentState === option.value}
							aria-pressed={currentState === option.value}
							onclick={() => setState(option.value)}
						>
							{option.label}
						</Button>
					{/each}
				</ButtonGroup>
			</div>
		{/if}

		<div class="d-flex flex-wrap gap-2">
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
	</div>
</Offcanvas>
