<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '@sveltestrap/sveltestrap';
	import {
		buildFilterUrl,
		parseFilterParams,
		type IssueSort,
		type SortDirection
	} from '#lib/url-filter';

	/**
	 * Sort + direction for the Issues stream. Both live in the URL so a
	 * reloaded or shared link keeps the chosen view. Sort is a view
	 * preference, not a filter, so it does not contribute to the filter badge.
	 */
	const options: Array<{ value: IssueSort; label: string }> = [
		{ value: 'priority', label: 'Priority' },
		{ value: 'updated', label: 'Updated' },
		{ value: 'created', label: 'Created' },
		{ value: 'title', label: 'Title' }
	];

	const filter = $derived(parseFilterParams(page.url.searchParams));

	function apply(patch: { sort: IssueSort } | { direction: SortDirection }) {
		void goto(
			buildFilterUrl(page.url.pathname, page.url.searchParams, {
				...filter,
				...patch
			}),
			{ reset: false }
		);
	}

	function toggleDirection() {
		apply({ direction: filter.direction === 'asc' ? 'desc' : 'asc' });
	}
</script>

<select
	id="issue-sort"
	class="form-select form-select-sm w-auto"
	value={filter.sort}
	onchange={(event) => apply({ sort: event.currentTarget.value as IssueSort })}
	aria-label="Sort issues by"
>
	{#each options as option (option.value)}
		<option value={option.value}>Sort: {option.label}</option>
	{/each}
</select>

<Button
	color="outline-secondary"
	size="sm"
	onclick={toggleDirection}
	aria-label={`Sort ${filter.direction === 'asc' ? 'descending' : 'ascending'}`}
	title={filter.direction === 'asc' ? 'Ascending' : 'Descending'}
>
	<i
		class="bi bi-arrow-{filter.direction === 'asc' ? 'up' : 'down'}"
		aria-hidden="true"
	></i>
</Button>
