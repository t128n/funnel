<script lang="ts">
	import { page } from '$app/state';
	import SegmentedControl from '#lib/components/common/SegmentedControl.svelte';

	/**
	 * All / Mine segmented control for the Issues view.
	 *
	 * "Mine" is not a separate route — it maps onto the `assignee=me` filter the
	 * server already resolves to the signed-in viewer (SPEC §9.2). This control
	 * owns that scope exclusively: the Assignee multi-select lists only *other*
	 * people, so "assigned to me" has a single affordance.
	 */
	const assignees = $derived(page.url.searchParams.getAll('assignee'));
	const mineActive = $derived(assignees.length === 1 && assignees[0] === 'me');

	/** Preserve every other param (the filter dimensions) while setting
	 *  or clearing the single `assignee=me` dimension. */
	function href(mine: boolean): string {
		const params = new URLSearchParams();
		page.url.searchParams.forEach((value, key) => params.append(key, value));
		params.delete('assignee');
		if (mine) params.append('assignee', 'me');
		const query = params.toString();
		return query ? `${page.url.pathname}?${query}` : page.url.pathname;
	}

	const items = $derived([
		{ label: 'All', href: href(false), active: !mineActive },
		{ label: 'Mine', href: href(true), active: mineActive }
	]);
</script>

<SegmentedControl label="Issue view" {items} />
