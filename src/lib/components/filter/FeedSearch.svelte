<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { buildFilterUrl, parseFilterParams } from '#lib/url-filter';

	/**
	 * Compact full-text search for the feed column. Owns the same `q` parameter
	 * as the classic Filter Bar and keeps the shared `#issue-search` id so the
	 * global ⌘K shortcut (Sidebar) can focus it.
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

<div class="search">
	<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
		<path
			d="M7 12A5 5 0 107 2a5 5 0 000 10zm3.5-1.5L14 14"
			fill="none"
			stroke="currentColor"
			stroke-width="1.4"
			stroke-linecap="round"
		/>
	</svg>
	<input
		id="issue-search"
		type="search"
		placeholder="Search title, body, comments…"
		value={search}
		oninput={(e) => onInput(e.currentTarget.value)}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		aria-label="Search issues"
	/>
</div>

<style>
	.search {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		height: 30px;
		padding: 0 var(--space-sm);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
	}

	.search:focus-within {
		border-color: var(--color-primary);
	}

	.search input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		font-size: var(--text-sm);
		color: var(--color-text-primary);
	}
</style>
