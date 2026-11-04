<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '@sveltestrap/sveltestrap';
	import { buildFilterUrl, parseFilterParams } from '#lib/url-filter';

	/**
	 * Full-text search for the feed column. Owns the same `q` parameter as the
	 * classic Filter Bar and keeps the shared `#issue-search` id so the `/`
	 * shortcut can focus the page-local filter (Mod+K is the global panel).
	 */
	interface Props {
		/** Width override for the containing toolbar. */
		class?: string;
		/** Match the compact density of the Composition A toolbar selects. */
		size?: 'sm';
	}

	let { class: className = '', size }: Props = $props();

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

<div class="d-flex min-w-0 flex-grow-1 {className}">
	<label class="visually-hidden" for="issue-search">Search</label>
	<div class="input-group {size ? `input-group-${size}` : ''}">
		<span class="input-group-text bg-body">
			<i class="bi bi-search" aria-hidden="true"></i>
		</span>
		<input
			bind:this={input}
			id="issue-search"
			type="search"
			class="form-control search-with-clear"
			placeholder="Search title, body, or comments"
			value={search}
			oninput={(event) => onInput(event.currentTarget.value)}
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
			aria-label="Search issues"
		/>
		{#if search}
			<Button color="outline-secondary" aria-label="Clear search" onclick={clear}>
				<i class="bi bi-x-lg" aria-hidden="true"></i>
			</Button>
		{/if}
	</div>
</div>
