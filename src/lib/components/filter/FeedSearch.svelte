<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '@sveltestrap/sveltestrap';
	import { buildFilterUrl, parseFilterParams } from '#lib/url-filter';

	/**
	 * Full-text search for the feed column. Owns the same `q` parameter as the
	 * classic Filter Bar and keeps the shared `#issue-search` id so the global
	 * ⌘K shortcut can focus it.
	 */
	interface Props {
		/** Width override for the containing toolbar. */
		class?: string;
	}

	let { class: className = '' }: Props = $props();

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

<div class="d-flex min-w-0 flex-column gap-1 {className}">
	<label for="issue-search" class="form-label small fw-semibold text-body-secondary mb-0"
		>Search</label
	>
	<div class="input-group input-group-sm">
		<span class="input-group-text text-body-secondary">
			<i class="bi bi-search" aria-hidden="true"></i>
		</span>
		<input
			bind:this={input}
			id="issue-search"
			type="search"
			class="form-control form-control-sm"
			placeholder="Title, body, comments…"
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
