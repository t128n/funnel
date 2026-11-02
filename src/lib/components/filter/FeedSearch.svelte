<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as InputGroup from '#lib/components/ui/input-group';
	import { buildFilterUrl, parseFilterParams } from '#lib/url-filter';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * Full-text search for the feed column. Owns the same `q` parameter as the
	 * classic Filter Bar and keeps the shared `#issue-search` id so the global
	 * ⌘K shortcut can focus it.
	 *
	 * Geometry matches the standard field: 2.25rem high, 12px leading inset.
	 * A leading icon identifies the field and a trailing clear control appears
	 * only when there is a query, so the browser's own search affordance is
	 * suppressed rather than doubled.
	 */
	const filter = $derived(parseFilterParams(page.url.searchParams));

	let search = $state(untrack(() => filter.search));
	let focused = $state(false);
	let input = $state<HTMLInputElement | null>(null);
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

	function clear() {
		onInput('');
		input?.focus();
	}
</script>

<div class="flex w-full min-w-0 flex-col gap-1 sm:w-[var(--layout-search-field)] sm:flex-none">
	<label for="issue-search" class="text-caption font-semibold text-fg-secondary">Search</label>
	<InputGroup.Root>
		<InputGroup.Addon align="inline-start" class="pl-3 text-fg-muted">
			<SearchIcon class="size-4" aria-hidden="true" />
		</InputGroup.Addon>
		<InputGroup.Input
			bind:ref={input}
			id="issue-search"
			type="search"
			class="px-2 [&::-webkit-search-cancel-button]:appearance-none"
			placeholder="Title, body, comments…"
			value={search}
			oninput={(event) => onInput(event.currentTarget.value)}
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
			aria-label="Search issues"
		/>
		{#if search}
			<InputGroup.Addon align="inline-end" class="pr-1">
				<button
					type="button"
					class="inline-flex size-(--size-control-sm) items-center justify-center rounded-sm text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					aria-label="Clear search"
					onclick={clear}
				>
					<XIcon class="size-4" aria-hidden="true" />
				</button>
			</InputGroup.Addon>
		{/if}
	</InputGroup.Root>
</div>
