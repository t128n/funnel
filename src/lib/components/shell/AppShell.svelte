<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Offcanvas } from '@sveltestrap/sveltestrap';
	import AppBar from './AppBar.svelte';
	import SidebarNav from './SidebarNav.svelte';
	import { focusTrap } from '#lib/client/focus-trap';
	import type { Role } from '#lib/roles';

	interface Props {
		user: { id: string; name: string; email: string; image: string | null; role: Role };
		inboxCount?: number;
		dueCount?: number;
		unread?: number;
		onSearch: () => void;
		children: Snippet;
	}

	let { user, inboxCount = 0, dueCount = 0, unread = 0, onSearch, children }: Props = $props();

	let navOpen = $state(false);

	function toggleNav() {
		navOpen = !navOpen;
	}
</script>

<a
	class="visually-hidden-focusable position-absolute top-0 start-0 m-2 p-2 bg-body border rounded"
	href="#main">Skip to main content</a
>

<div class="app-shell">
	<AppBar
		{user}
		{unread}
		navOpen={navOpen}
		onmenu={toggleNav}
		onsearch={onSearch}
	/>

	<div class="app-shell__body">
		<aside class="app-sidebar d-none d-lg-block" aria-label="Sidebar">
			<SidebarNav {inboxCount} {dueCount} {unread} />
		</aside>

		<main id="main" tabindex="-1" class="app-main">
			{@render children()}
		</main>
	</div>
</div>

<Offcanvas
	isOpen={navOpen}
	toggle={toggleNav}
	placement="start"
	header="Navigation"
	body={false}
	class="border-end"
>
	<div class="h-100 overflow-y-auto" use:focusTrap={navOpen}>
		<SidebarNav {inboxCount} {dueCount} {unread} onNavigate={() => (navOpen = false)} />
	</div>
</Offcanvas>
