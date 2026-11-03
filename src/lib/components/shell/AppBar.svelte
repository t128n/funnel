<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		Button,
		Dropdown,
		DropdownItem,
		DropdownMenu,
		DropdownToggle
	} from '@sveltestrap/sveltestrap';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import { resolvedTheme, setTheme, themeChoice, type ThemeChoice } from '#lib/client/theme';
	import { signOut } from '#lib/client/auth';
	import type { Role } from '#lib/roles';

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

	const dark = $derived($resolvedTheme === 'dark');
	const shortcut = $derived(isMac ? '⌘ K' : 'Ctrl K');

	const themes: { value: ThemeChoice; label: string; icon: string }[] = [
		{ value: 'light', label: 'Light', icon: 'bi-sun' },
		{ value: 'dark', label: 'Dark', icon: 'bi-moon' },
		{ value: 'system', label: 'Match system', icon: 'bi-circle-half' }
	];

	async function handleSignOut() {
		await signOut();
		await goto('/login');
	}

	function openSettings(path: string) {
		void goto(path);
	}
</script>

<header class="navbar navbar-expand navbar-dark bg-dark app-bar px-3">
	<Button
		color="link"
		class="nav-quiet d-xl-none"
		aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
		aria-expanded={navOpen}
		onclick={onmenu}
	>
		<i class="bi bi-list fs-5" aria-hidden="true"></i>
	</Button>

	<a href="/" class="navbar-brand mb-0 text-decoration-none" translate="no">funnel</a>

	<span class="navbar-text d-none d-sm-inline border-start border-secondary ps-3 ms-2 py-0">
		<i class="bi bi-folder2 me-1" aria-hidden="true"></i>All repositories
	</span>

	<div class="ms-auto d-flex align-items-center gap-1">
		<Button
			color="link"
			class="nav-quiet d-flex align-items-center gap-2"
			aria-label="Search issues"
			onclick={onsearch}
		>
			<i class="bi bi-search" aria-hidden="true"></i>
			<span class="d-none d-md-inline">Search</span>
			<kbd class="nav-kbd d-none d-lg-inline">{shortcut}</kbd>
		</Button>

		<Button
			color="link"
			href="/notifications"
			class="nav-quiet position-relative"
			aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
		>
			<i class="bi bi-bell fs-5" aria-hidden="true"></i>
			{#if unread > 0}
				<span
					class="badge rounded-pill text-bg-danger position-absolute top-0 start-100 translate-middle"
				>
					{unread > 99 ? '99+' : unread}
					<span class="visually-hidden">unread</span>
				</span>
			{/if}
		</Button>

		<Dropdown>
			<DropdownToggle color="link" caret={false} class="nav-quiet" aria-label="Theme" title="Theme">
				<i class="bi {dark ? 'bi-moon' : 'bi-sun'} fs-5" aria-hidden="true"></i>
			</DropdownToggle>
			<DropdownMenu end>
				<DropdownItem header>Theme</DropdownItem>
				{#each themes as theme (theme.value)}
					<DropdownItem
						class="d-flex align-items-center gap-2"
						on:click={() => setTheme(theme.value)}
					>
						<i class="bi {theme.icon}" aria-hidden="true"></i>
						<span>{theme.label}</span>
						{#if $themeChoice === theme.value}
							<i class="bi bi-check2 ms-auto" aria-hidden="true"></i>
						{/if}
					</DropdownItem>
				{/each}
			</DropdownMenu>
		</Dropdown>

		<Dropdown>
			<DropdownToggle
				color="link"
				caret={false}
				class="nav-quiet d-flex align-items-center gap-2"
				aria-label="Account menu"
			>
				<Avatar login={user.name} avatarUrl={user.image} size={24} />
				<span class="d-none d-lg-inline text-truncate" style="max-width: 10rem">{user.name}</span>
				<i class="bi bi-chevron-down small" aria-hidden="true"></i>
			</DropdownToggle>
			<DropdownMenu end>
				<DropdownItem header>
					<span class="d-block text-truncate fw-semibold">{user.name}</span>
					<span class="d-block text-truncate small text-body-secondary">{user.email}</span>
				</DropdownItem>
				<DropdownItem divider />
				<DropdownItem class="d-flex align-items-center gap-2" on:click={() => openSettings('/settings')}>
					<i class="bi bi-person" aria-hidden="true"></i>Account
				</DropdownItem>
				<DropdownItem
					class="d-flex align-items-center gap-2"
					on:click={() => openSettings('/settings/appearance')}
				>
					<i class="bi bi-gear" aria-hidden="true"></i>Settings
				</DropdownItem>
				<DropdownItem divider />
				<DropdownItem
					class="d-flex align-items-center gap-2 text-danger"
					on:click={() => void handleSignOut()}
				>
					<i class="bi bi-box-arrow-right" aria-hidden="true"></i>Sign Out
				</DropdownItem>
			</DropdownMenu>
		</Dropdown>
	</div>
</header>
