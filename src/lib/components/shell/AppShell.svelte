<script lang="ts">
	import type { Snippet } from "svelte";
	import * as Sheet from "#lib/components/ui/sheet";
	import AppBar from "./AppBar.svelte";
	import SidebarNav from "./SidebarNav.svelte";
	import type { Role } from "#lib/roles";

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
</script>

<a class="skip-link" href="#main">Skip to main content</a>

<div class="flex h-svh flex-col overflow-hidden bg-canvas">
	<AppBar
		{user}
		{unread}
		navOpen={navOpen}
		onmenu={() => (navOpen = !navOpen)}
		onsearch={onSearch}
	/>

	<div class="flex min-h-0 flex-1 overflow-hidden">
		<aside
			class="hidden w-[var(--layout-sidebar)] shrink-0 overflow-y-auto border-r border-border-subtle bg-surface lg:block"
			aria-label="Sidebar"
		>
			<SidebarNav {inboxCount} {dueCount} {unread} />
		</aside>

		<main
			id="main"
			tabindex="-1"
			class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-canvas outline-none"
		>
			{@render children()}
		</main>
	</div>
</div>

<Sheet.Root bind:open={navOpen}>
	<Sheet.Content side="left" class="p-0">
		<Sheet.Header class="sr-only">
			<Sheet.Title>Navigation</Sheet.Title>
			<Sheet.Description>Funnel navigation</Sheet.Description>
		</Sheet.Header>
		<div class="h-full">
			<SidebarNav
				{inboxCount}
				{dueCount}
				{unread}
				onNavigate={() => (navOpen = false)}
			/>
		</div>
	</Sheet.Content>
</Sheet.Root>
