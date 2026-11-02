<script lang="ts">
	import { goto } from "$app/navigation";
	import { onMount } from "svelte";
	import { resolvedTheme, setTheme } from "#lib/client/theme";
	import { signOut } from "#lib/client/auth";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { Kbd } from "#lib/components/ui/kbd";
	import Avatar from "#lib/components/common/Avatar.svelte";
	import BellIcon from "@lucide/svelte/icons/bell";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import MenuIcon from "@lucide/svelte/icons/menu";
	import MoonIcon from "@lucide/svelte/icons/moon";
	import SearchIcon from "@lucide/svelte/icons/search";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import SunIcon from "@lucide/svelte/icons/sun";
	import UserIcon from "@lucide/svelte/icons/user";
	import type { Role } from "#lib/roles";

	interface Props {
		user: { id: string; name: string; email: string; image: string | null; role: Role };
		unread?: number;
		onmenu: () => void;
		onsearch: () => void;
		navOpen?: boolean;
	}

	let { user, unread = 0, onmenu, onsearch, navOpen = false }: Props = $props();

	let isMac = $state(true);
	onMount(() => {
		isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
	});

	const dark = $derived($resolvedTheme === "dark");
	const shortcut = $derived(isMac ? "⌘ K" : "Ctrl K");

	async function handleSignOut() {
		await signOut();
		await goto("/login");
	}
</script>

<header
	class="app-bar flex h-[var(--layout-app-bar)] shrink-0 items-center gap-3 border-b border-app-bar-divider bg-app-bar px-[var(--layout-page-padding)] text-app-bar-text"
>
	<button
		type="button"
		class="inline-flex size-(--size-control-md) items-center justify-center rounded-sm text-app-bar-text hover:bg-app-bar-raised focus-visible:outline-accent-on-dark lg:hidden"
		aria-label={navOpen ? "Close navigation" : "Open navigation"}
		aria-expanded={navOpen}
		onclick={onmenu}
	>
		<MenuIcon class="size-5" />
	</button>

	<a href="/" class="shrink-0 text-body font-semibold text-accent-on-dark" translate="no">
		funnel
	</a>

	<span class="hidden h-(--size-divider) w-px bg-app-bar-divider sm:block" aria-hidden="true"></span>
	<span class="hidden min-w-0 truncate text-body text-app-bar-text-secondary sm:block">
		All repositories
	</span>

	<span class="flex-1"></span>

	<button
		type="button"
		class="inline-flex h-(--size-control-md) items-center gap-2 rounded-sm px-2 text-body text-app-bar-text-secondary hover:bg-app-bar-raised hover:text-app-bar-text focus-visible:outline-accent-on-dark"
		aria-label="Search issues"
		onclick={onsearch}
	>
		<SearchIcon class="size-4" />
		<span class="hidden md:inline">Search</span>
		<Kbd class="hidden border-app-bar-divider bg-app-bar-raised text-app-bar-text-secondary md:inline-flex">
			{shortcut}
		</Kbd>
	</button>

	<a
		href="/notifications"
		class="relative inline-flex size-(--size-control-md) items-center justify-center rounded-sm text-app-bar-text hover:bg-app-bar-raised focus-visible:outline-accent-on-dark"
		aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
	>
		<BellIcon class="size-5" />
		{#if unread > 0}
			<span class="text-caption font-semibold text-app-bar-text tabular-nums">
				{unread > 99 ? "99+" : unread}
			</span>
		{/if}
	</a>

	<button
		type="button"
		class="inline-flex size-(--size-control-md) items-center justify-center rounded-sm text-app-bar-text hover:bg-app-bar-raised focus-visible:outline-accent-on-dark"
		aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
		title={dark ? "Switch to light theme" : "Switch to dark theme"}
		onclick={() => setTheme(dark ? "light" : "dark")}
	>
		{#if dark}
			<SunIcon class="size-5" />
		{:else}
			<MoonIcon class="size-5" />
		{/if}
	</button>

	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="inline-flex h-(--size-control-md) items-center gap-2 rounded-sm px-1.5 text-body text-app-bar-text hover:bg-app-bar-raised focus-visible:outline-accent-on-dark"
			aria-label="Account menu"
		>
			<Avatar login={user.name} avatarUrl={user.image} size={24} />
			<span class="hidden max-w-32 truncate md:inline">{user.name}</span>
			<ChevronDownIcon class="hidden size-3.5 text-app-bar-text-secondary md:block" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-56">
			<DropdownMenu.Label class="px-2 py-1.5">
				<span class="block truncate text-body font-semibold text-fg">{user.name}</span>
				<span class="block truncate text-caption text-fg-secondary">{user.email}</span>
			</DropdownMenu.Label>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onSelect={() => void goto("/settings")}>
				<UserIcon />
				Account
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={() => void goto("/settings/appearance")}>
				<SettingsIcon />
				Settings
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item variant="destructive" onSelect={() => void handleSignOut()}>
				<LogOutIcon />
				Sign Out
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</header>
