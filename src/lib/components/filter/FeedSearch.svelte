<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Hint from '#lib/components/hotkeys/Hint.svelte';
	import * as InputGroup from '#lib/components/ui/input-group';
	import { appHotkeys } from '#lib/client/hotkeys';
	import { buildFilterUrl, parseFilterParams } from '#lib/url-filter';
	import SearchIcon from '@lucide/svelte/icons/search';

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

<InputGroup.Root class="h-7">
	<InputGroup.Addon>
		<SearchIcon />
	</InputGroup.Addon>
	<InputGroup.Input
		id="issue-search"
		type="search"
		placeholder="Search title, body, comments…"
		value={search}
		oninput={(e) => onInput(e.currentTarget.value)}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		aria-label="Search issues"
	/>
	<!-- Reveals ⌘K / Ctrl+K while the modifier is held; collapses when idle. -->
	<InputGroup.Addon align="inline-end" class="empty:hidden">
		<Hint hotkey={appHotkeys['nav.search']} />
	</InputGroup.Addon>
</InputGroup.Root>
