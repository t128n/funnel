<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppBar from './AppBar.svelte';
	import type { Role } from '#lib/roles';

	interface Props {
		user: { id: string; name: string; email: string; image: string | null; role: Role };
		repos?: string[];
		inboxCount?: number;
		dueCount?: number;
		unread?: number;
		onSearch: () => void;
		children: Snippet;
	}

	let {
		user,
		repos = [],
		inboxCount = 0,
		dueCount = 0,
		unread = 0,
		onSearch,
		children
	}: Props = $props();
</script>

<a
	class="visually-hidden-focusable position-absolute top-0 start-0 m-2 p-2 bg-body border rounded"
	href="#main">Skip to main content</a
>

<AppBar {user} {repos} {inboxCount} {dueCount} {unread} onsearch={onSearch} />

<!--
	Composition A has one navigation layer and normal document scroll. There is
	no persistent sidebar, no fixed-height cockpit frame, and no nested pane
	scroller: each route owns its container and the page scrolls as a page.
	The wrapper is a div rather than a second <main> because each route renders
	its own page-level main landmark.
-->
<div id="main" tabindex="-1" class="app-main">
	{@render children()}
</div>
