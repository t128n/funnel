<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Input } from '#lib/components/ui/input';
	import { buildFilterUrl, parseFilterParams } from '#lib/url-filter';

	/**
	 * Compact full-text search for the feed column. Owns the same `q` parameter
	 * as the classic Filter Bar and keeps the shared `#issue-search` id so the
	 * global ⌘K shortcut can focus it.
	 */
	const filter = $derived(parseFilterParams(page.url.searchParams));

	let search = $state(untrack(() => filter.search));
	let focused = $state(false);
	let debounce: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const fromUrl = filter.search;
		if (!focused && fromUrl !== search) search = fromUrl;
	});

	// A navigation away must not fire a debounced `goto` afterwards.
	$effect(() => () => clearTimeout(debounce));

	function onInput(value: string) {
		search = value;
		clearTimeout(debounce);
		debounce = setTimeout(() => {
			void goto(
				buildFilterUrl(page.url.pathname, page.url.searchParams, {
					...filter,
					search: value
				}),
				{ reset: false }
			);
		}, 250);
	}
</script>

<label class="flex w-full min-w-0 flex-col gap-1 sm:w-[var(--layout-search-field)] sm:flex-none">
	<span class="text-caption font-semibold text-fg-secondary">Search</span>
	<Input
		id="issue-search"
		type="search"
		class="min-w-0"
		placeholder="Title, body, comments…"
		value={search}
		oninput={(e) => onInput(e.currentTarget.value)}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		aria-label="Search issues"
	/>
</label>
