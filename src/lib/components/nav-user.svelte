<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import * as Avatar from "#lib/components/ui/avatar/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import NavItem from "#lib/components/nav/nav-item.svelte";
	import { signOut } from "#lib/client/auth";

	let {
		user
	}: { user: { id: string; name: string; email: string; image: string | null } } = $props();

	const initial = $derived(user.name.slice(0, 1).toUpperCase() || "?");
	const settingsActive = $derived(page.url.pathname.startsWith("/settings"));

	async function handleSignOut() {
		await signOut();
		await goto("/login");
	}
</script>

<Sidebar.Menu>
	<!-- App-level Settings sits in the footer, apart from the scoped view
	     navigation, and keeps an icon affordance in the collapsed rail. -->
	<NavItem href="/settings" label="Settings" icon={SettingsIcon} active={settingsActive} />

	<Sidebar.MenuItem>
		<!-- The footer shows the profile directly with a single sign-out action
		     instead of a dropdown. -->
		<div
			class="group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! flex items-center gap-2 overflow-hidden rounded-md p-2 text-sm"
		>
			<Avatar.Root class="size-8 shrink-0 rounded-lg">
				{#if user.image}
					<Avatar.Image src={user.image} alt={user.name} />
				{/if}
				<Avatar.Fallback class="rounded-lg">{initial}</Avatar.Fallback>
			</Avatar.Root>
			<div class="group-data-[collapsible=icon]:hidden grid min-w-0 flex-1 text-start leading-tight">
				<span class="truncate font-medium">{user.name}</span>
				<span class="truncate text-xs">{user.email}</span>
			</div>
			<Button
				variant="ghost"
				size="icon-sm"
				class="group-data-[collapsible=icon]:hidden ms-auto shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
				title="Sign out"
				aria-label="Sign out"
				onclick={() => void handleSignOut()}
			>
				<LogOutIcon />
			</Button>
		</div>
	</Sidebar.MenuItem>
</Sidebar.Menu>
