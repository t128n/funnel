<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppBar from './AppBar.svelte';
	import GlobalSearch from './GlobalSearch.svelte';
	import type { Role } from '#lib/roles';
	import type { SavedView } from '#lib/saved-views';

	interface Props {
		user: { id: string; name: string; email: string; image: string | null; role: Role };
		/** `owner/name` → project key for issue references in search results. */
		repoShortcodes?: Record<string, string>;
		/** Writers see the palette's create command; readers do not. */
		mayWrite?: boolean;
		/** Saved views offered as palette commands. */
		savedViews?: SavedView[];
		inboxCount?: number;
		dueCount?: number;
		unread?: number;
		onSearch: () => void;
		children: Snippet;
	}

	let {
		user,
		repoShortcodes = {},
		mayWrite = false,
		savedViews = [],
		inboxCount = 0,
		dueCount = 0,
		unread = 0,
		onSearch,
		children
	}: Props = $props();
</script>

<a class="skip-link visually-hidden-focusable" href="#main">Skip to main content</a>

<AppBar {user} {inboxCount} {dueCount} {unread} onsearch={onSearch} />
<GlobalSearch {repoShortcodes} {mayWrite} {savedViews} />

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
