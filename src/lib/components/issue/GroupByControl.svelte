<script lang="ts">
	import { getGroupBy, setGroupBy } from '#lib/client/list-prefs.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
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
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class="link text-sm">Group</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-44">
		<DropdownMenu.Label>Group by</DropdownMenu.Label>
		<DropdownMenu.RadioGroup
			value={group}
			onValueChange={(value) => setGroupBy(value as GroupKey)}
		>
			{#each options as option (option.value)}
				<DropdownMenu.RadioItem value={option.value}>{option.label}</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
