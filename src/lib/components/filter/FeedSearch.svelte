<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
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

<input
	id="issue-search"
	type="search"
	class="border-[color:var(--input)] placeholder:text-muted-foreground h-7 w-full rounded-none border bg-transparent px-2 text-sm focus-visible:border-[color:var(--primary)]"
	placeholder="Search title, body, comments…"
	value={search}
	oninput={(e) => onInput(e.currentTarget.value)}
	onfocus={() => (focused = true)}
	onblur={() => (focused = false)}
	aria-label="Search issues"
/>
