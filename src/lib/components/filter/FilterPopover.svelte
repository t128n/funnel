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
		buildFilterUrl,
		NONE,
		parseFilterParams,
		type ClientFilter
	} from '#lib/url-filter';
	import {
		clearOwnedFilters,
		ME,
		ownedFilterCount,
		ownsDimension,
		type FilterDimension
	} from '#lib/components/filter/drawer-filters';

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
		/**
		 * Dimensions owned by another surface (the Issues single-row toolbar).
		 * Hidden dimensions stay in the URL and are preserved by this
		 * offcanvas's own Clear action.
		 */
		hide?: readonly FilterDimension[];
		/** A quiet link instead of an outline button (the Issues header). */
		quiet?: boolean;
	}

	let {
		options,
		allowNoStatus = true,
		showState = false,
		hide = [],
		quiet = false
	}: Props = $props();

	const hidden = $derived(new Set(hide));

	let open = $state(false);

	const filter = $derived(parseFilterParams(page.url.searchParams));

	// "Me" is owned by the All/Mine scope switch (ViewSegment), so the Assignee
	// multi-select only offers other people and ignores the scope when it counts
	// active filters.
	const scope = $derived({ hidden, showState });
	const scopedAssignees = $derived(filter.assignees.filter((value) => value !== ME));
	const count = $derived(ownedFilterCount(filter, scope));

	const repoOptions = $derived(
		options.repos.map((repo) => ({ value: repo.slug, label: repo.slug }))
	);
	const assigneeOptions = $derived([
		...options.assignees.map((user) => ({ value: user.login, label: user.login })),
		{ value: NONE, label: 'Unassigned' }
	]);
	const selectedAssignees = $derived([
		...scopedAssignees,
		...(filter.unassigned ? [NONE] : [])
	]);
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
	const plannedOptions = [
		{ value: 'this-week', label: 'This week' },
		{ value: 'next-week', label: 'Next week' },
		{ value: 'scheduled', label: 'Planned' },
		{ value: 'unscheduled', label: 'Not planned' }
	];
	const blockedOptions = [
		{ value: 'any', label: 'Any' },
		{ value: 'true', label: 'Blocked' },
		{ value: 'false', label: 'Not blocked' }
	];
	const currentBlocked = $derived(
		filter.blocked === true ? 'true' : filter.blocked === false ? 'false' : 'any'
	);

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

	/** A dimension this drawer currently owns. */
	function visible(dimension: FilterDimension): boolean {
		return ownsDimension(dimension, scope);
	}

	type ChipKey =
		| 'repos'
		| 'states'
		| 'statuses'
		| 'assignees'
		| 'priorities'
		| 'sizes'
		| 'labels'
		| 'planned'
		| 'milestones'
		| 'blocked';

	interface ActiveChip {
		key: ChipKey;
		value: string;
		label: string;
	}

	function optionLabel(
		options: readonly { value: string; label: string }[],
		value: string
	): string {
		return options.find((option) => option.value === value)?.label ?? value;
	}

	/**
	 * One removable chip per active value in a drawer-owned dimension. Hidden
	 * (toolbar-owned) dimensions and the `me` scope are deliberately absent, so
	 * the chips match the badge and Clear action exactly.
	 */
	const activeChips = $derived.by((): ActiveChip[] => {
		const chips: ActiveChip[] = [];
		const add = (
			key: ChipKey,
			name: string,
			values: readonly string[],
			label: (value: string) => string
		) => {
			for (const value of values) {
				chips.push({ key, value, label: `${name}: ${label(value)}` });
			}
		};

		if (visible('state')) {
			add('states', 'State', filter.states, (value) => optionLabel(STATE_OPTIONS, value));
		}
		if (visible('repo')) {
			add('repos', 'Repo', filter.repos, (value) => value);
		}
		if (visible('status')) {
			add('statuses', 'Status', selectedStatuses, (value) =>
				optionLabel(statusOptions, value)
			);
		}
		if (visible('assignee')) {
			add('assignees', 'Assignee', scopedAssignees, (value) =>
				optionLabel(assigneeOptions, value)
			);
			if (filter.unassigned) {
				chips.push({
					key: 'assignees',
					value: NONE,
					label: 'Assignee: Unassigned'
				});
			}
		}
		if (visible('priority')) {
			add('priorities', 'Priority', filter.priorities, (value) =>
				optionLabel(priorityOptions, value)
			);
		}
		if (visible('size')) {
			add('sizes', 'Size', filter.sizes, (value) => optionLabel(sizeOptions, value));
		}
		if (visible('label')) {
			add('labels', 'Label', filter.labels, (value) => value);
		}
		if (visible('planned')) {
			add('planned', 'Planned', filter.planned, (value) =>
				optionLabel(plannedOptions, value)
			);
		}
		if (visible('milestone')) {
			add('milestones', 'Milestone', filter.milestones, (value) =>
				optionLabel(milestoneOptions, value)
			);
		}
		if (visible('blocked') && filter.blocked !== null) {
			chips.push({
				key: 'blocked',
				value: String(filter.blocked),
				label: `Blocked: ${filter.blocked ? 'Blocked' : 'Not blocked'}`
			});
		}
		return chips;
	});

	function removeChip(key: ChipKey, value: string) {
		if (key === 'assignees' && value === NONE) {
			apply({ ...filter, unassigned: false });
			return;
		}
		if (key === 'blocked') {
			apply({ ...filter, blocked: null });
			return;
		}
		set(key, filter[key].filter((entry) => entry !== value));
	}

	function apply(next: ClientFilter) {
		void goto(buildFilterUrl(page.url.pathname, page.url.searchParams, next), { reset: false });
	}

	function set<K extends keyof ClientFilter>(key: K, value: ClientFilter[K]) {
		apply({ ...filter, search: filter.search, [key]: value });
	}

	function setState(next: StateView) {
		set('states', next === 'all' ? ['open', 'closed'] : next === 'closed' ? ['closed'] : []);
	}

	function setAssignees(values: string[]) {
		apply({
			...filter,
			assignees: values.filter((value) => value !== NONE),
			unassigned: values.includes(NONE)
		});
	}

	function setBlocked(next: string) {
		apply({ ...filter, blocked: next === 'true' ? true : next === 'false' ? false : null });
	}

	function clearAll() {
		apply(clearOwnedFilters(filter, scope));
	}

	function toggle() {
		open = !open;
	}
</script>

<Button
	color={quiet ? 'link' : 'outline-secondary'}
	size={quiet ? 'sm' : ''}
	class={quiet ? 'text-decoration-none px-1' : ''}
	onclick={() => (open = true)}
>
	<i class="bi bi-funnel me-1" aria-hidden="true"></i>
	More filters
	{#if count > 0}
		<span class="badge text-bg-secondary ms-1">{count}</span>
	{/if}
</Button>

<Offcanvas isOpen={open} {toggle} placement="end" header="More filters" body={false}>
	<div class="d-flex flex-column gap-3 p-3" use:focusTrap={open}>
		<div class="d-flex align-items-center justify-content-between gap-3">
			<span class="small text-body-secondary">
				Long-tail filters shared by every issue list.
			</span>
			{#if count > 0}
				<Button color="link" size="sm" onclick={clearAll}>
					Clear {count} {count === 1 ? 'filter' : 'filters'}
				</Button>
			{/if}
		</div>

		{#if activeChips.length > 0}
			<div class="d-flex flex-wrap gap-2" aria-label="Active filters">
				{#each activeChips as chip (`${chip.key}:${chip.value}`)}
					<button
						type="button"
						class="btn btn-sm btn-outline-secondary rounded-pill d-inline-flex align-items-center gap-1"
						aria-label={`Remove ${chip.label} filter`}
						onclick={() => removeChip(chip.key, chip.value)}
					>
						<span>{chip.label}</span>
						<i class="bi bi-x-lg small" aria-hidden="true"></i>
					</button>
				{/each}
			</div>
		{/if}

		{#if visible('state') || visible('repo') || visible('milestone')}
			<section>
				<h3 class="h6 fw-semibold text-body-secondary mb-2">Scope</h3>
				<div class="d-flex flex-column gap-2">
					{#if visible('state')}
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
					{/if}
					<div class="d-flex flex-wrap gap-2">
						{#if visible('repo')}
							<MultiSelect
								label="Repo"
								options={repoOptions}
								selected={filter.repos}
								onselect={(values) => set('repos', values)}
							/>
						{/if}
						{#if visible('milestone')}
							<MultiSelect
								label="Milestone"
								options={milestoneOptions}
								selected={filter.milestones}
								onselect={(values) => set('milestones', values)}
							/>
						{/if}
					</div>
				</div>
			</section>
		{/if}

		{#if visible('status') || visible('priority') || visible('assignee') || visible('size') || visible('label') || visible('blocked')}
			<section>
				<h3 class="h6 fw-semibold text-body-secondary mb-2">Classification</h3>
				<div class="d-flex flex-wrap gap-2">
					{#if visible('status')}
						<MultiSelect
							label="Status"
							options={statusOptions}
							selected={selectedStatuses}
							onselect={(values) => set('statuses', values)}
						/>
					{/if}
					{#if visible('priority')}
						<MultiSelect
							label="Priority"
							options={priorityOptions}
							selected={filter.priorities}
							onselect={(values) => set('priorities', values)}
						/>
					{/if}
					{#if visible('assignee')}
						<MultiSelect
							label="Assignee"
							options={assigneeOptions}
							selected={selectedAssignees}
							onselect={setAssignees}
						/>
					{/if}
					{#if visible('size')}
						<MultiSelect
							label="Size"
							options={sizeOptions}
							selected={filter.sizes}
							onselect={(values) => set('sizes', values)}
						/>
					{/if}
					{#if visible('label')}
						<MultiSelect
							label="Labels"
							options={labelOptions}
							selected={filter.labels}
							onselect={(values) => set('labels', values)}
						/>
					{/if}
				</div>
				{#if visible('blocked')}
					<div class="d-flex align-items-center gap-2 mt-2">
						<span class="small text-body-secondary">Blocked</span>
						<ButtonGroup size="sm">
							{#each blockedOptions as option (option.value)}
								<Button
									color="outline-secondary"
									size="sm"
									active={currentBlocked === option.value}
									aria-pressed={currentBlocked === option.value}
									onclick={() => setBlocked(option.value)}
								>
									{option.label}
								</Button>
							{/each}
						</ButtonGroup>
					</div>
				{/if}
			</section>
		{/if}

		{#if visible('planned')}
			<section>
				<h3 class="h6 fw-semibold text-body-secondary mb-2">Planning</h3>
				<div class="d-flex flex-wrap gap-2">
					<MultiSelect
						label="Planned"
						options={plannedOptions}
						selected={filter.planned}
						onselect={(values) => set('planned', values)}
					/>
				</div>
			</section>
		{/if}
	</div>
</Offcanvas>
