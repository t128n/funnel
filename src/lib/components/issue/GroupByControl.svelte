<script lang="ts">
	import {
		Dropdown,
		DropdownItem,
		DropdownMenu,
		DropdownToggle
	} from '@sveltestrap/sveltestrap';
	import { getGroupBy, setGroupBy } from '#lib/client/list-prefs.svelte';
	import type { GroupKey, ProjectOption } from '#lib/components/issue/grouping';

	interface Props {
		/** Configured project indicators; the Project option hides when empty. */
		projects?: ProjectOption[];
		/** Whether any mirrored repo has milestones; the Milestone option hides when not. */
		hasMilestones?: boolean;
	}

	let { projects = [], hasMilestones = false }: Props = $props();

	/**
	 * Group-by switch for the issue feeds. Owns the shared preference in
	 * `list-prefs`, so every list view sections the same way.
	 */
	const options = $derived.by((): { value: GroupKey; label: string }[] => [
		{ value: 'status', label: 'Status' },
		{ value: 'priority', label: 'Priority' },
		...(projects.length > 0 ? [{ value: 'project' as GroupKey, label: 'Project' }] : []),
		...(hasMilestones ? [{ value: 'milestone' as GroupKey, label: 'Milestone' }] : []),
		{ value: 'repo', label: 'Repository' },
		{ value: 'none', label: 'None' }
	]);

	const stored = $derived(getGroupBy());
	// A stored `project`/`milestone` preference with nothing to group by falls back to flat.
	const group = $derived(options.some((option) => option.value === stored) ? stored : 'none');
	const current = $derived(options.find((option) => option.value === group)?.label ?? 'None');
</script>

<Dropdown>
	<DropdownToggle
		color="secondary"
		outline
		class="d-inline-flex align-items-center gap-2"
		aria-label={`Group issues by: ${current}`}
	>
		<i class="bi bi-list" aria-hidden="true"></i>
		<span>Group</span>
		<i class="bi bi-chevron-down small" aria-hidden="true"></i>
	</DropdownToggle>

	<DropdownMenu end>
		<li><h6 class="dropdown-header">Group by</h6></li>
		{#each options as option (option.value)}
			<DropdownItem
				active={group === option.value}
				on:click={() => setGroupBy(option.value)}
			>
				<i
					class="bi bi-check-lg me-2 {group === option.value ? '' : 'invisible'}"
					aria-hidden="true"
				></i>
				{option.label}
			</DropdownItem>
		{/each}
	</DropdownMenu>
</Dropdown>
