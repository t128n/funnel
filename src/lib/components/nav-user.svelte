<script lang="ts">
	import { goto } from "$app/navigation";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import NavItem from "#lib/components/nav/nav-item.svelte";
	import { signOut } from "#lib/client/auth";
	import type { Role } from "#lib/roles";

	/**
	 * Sidebar footer identity block, Bugzilla chrome: a muted `Signed in as`
	 * line and two plain text links. No avatar chip, no role badge.
	 *
	 * The rail keeps a single Settings monogram so the account area stays
	 * reachable while the sidebar is collapsed.
	 */
	let {
		user
	}: { user: { id: string; name: string; email: string; image: string | null; role: Role } } =
		$props();

	async function handleSignOut() {
		await signOut();
		await goto("/login");
	}
</script>

<Sidebar.Menu>
	<div class="group-data-[collapsible=icon]:block hidden">
		<NavItem href="/settings" label="Settings" />
	</div>

	<Sidebar.MenuItem>
		<div class="group-data-[collapsible=icon]:hidden px-2 py-1 text-xs leading-tight">
			<p class="text-muted-foreground truncate">Signed in as {user.name}</p>
			<p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
				<a class="link" href="/settings">Settings</a>
				<span class="text-muted-foreground" aria-hidden="true">·</span>
				<button
					type="button"
					class="link cursor-pointer border-0 bg-transparent p-0"
					onclick={() => void handleSignOut()}
				>
					Sign out
				</button>
			</p>
		</div>
	</Sidebar.MenuItem>
</Sidebar.Menu>
