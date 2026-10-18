<script lang="ts">
	import { goto } from "$app/navigation";
	import { formatForDisplay } from "@tanstack/svelte-hotkeys";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import * as Avatar from "#lib/components/ui/avatar/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import { useSidebar } from "#lib/components/ui/sidebar/index.js";
	import { signOut } from "#lib/client/auth";
	import { appHotkeys } from "#lib/client/hotkeys";
	import { openSettings } from "#lib/client/settings.svelte";

	let {
		user
	}: { user: { id: string; name: string; email: string; image: string | null } } = $props();

	const sidebar = useSidebar();

	const initial = $derived(user.name.slice(0, 1).toUpperCase() || "?");

	// The effective binding, falling back to the declared default (the catalog
	// has no unbound entries today, but the type allows it).
	const settingsShortcut = $derived(
		appHotkeys["app.settings"].hotkey ?? appHotkeys["app.settings"].defaultHotkey
	);

	async function handleSignOut() {
		await signOut();
		await goto("/login");
	}

	/** Close the mobile sheet before opening the (also modal) settings dialog. */
	function handleSettings() {
		if (sidebar.isMobile) sidebar.setOpenMobile(false);
		openSettings();
	}
</script>

{#snippet profile()}
	<Avatar.Root class="size-8 rounded-lg">
		{#if user.image}
			<Avatar.Image src={user.image} alt={user.name} />
		{/if}
		<Avatar.Fallback class="rounded-lg">{initial}</Avatar.Fallback>
	</Avatar.Root>
	<div class="grid flex-1 text-start text-sm leading-tight">
		<span class="truncate font-medium">{user.name}</span>
		<span class="truncate text-xs">{user.email}</span>
	</div>
{/snippet}

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						size="lg"
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						{...props}
					>
						{@render profile()}
						<ChevronsUpDownIcon class="ms-auto" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-56"
				side={sidebar.isMobile ? "bottom" : "right"}
				align="end"
				sideOffset={4}
			>
				<DropdownMenu.Label class="p-0 font-normal">
					<div class="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
						{@render profile()}
					</div>
				</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onSelect={handleSettings}>
					<SettingsIcon />
					Settings
					<DropdownMenu.Shortcut>{formatForDisplay(settingsShortcut)}</DropdownMenu.Shortcut>
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onSelect={() => void handleSignOut()}>
					<LogOutIcon />
					Sign out
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
