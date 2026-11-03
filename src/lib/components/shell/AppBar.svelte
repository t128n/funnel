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
	import { resolvedTheme, setTheme } from '#lib/client/theme';
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
		class="d-lg-none p-1 text-white text-decoration-none"
		aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
		aria-expanded={navOpen}
		onclick={onmenu}
	>
		<i class="bi bi-list fs-5" aria-hidden="true"></i>
	</Button>

	<a href="/" class="navbar-brand mb-0 text-decoration-none" translate="no">funnel</a>

	<span class="navbar-text d-none d-sm-inline border-start border-secondary ps-3 ms-2 py-0">
		All repositories
	</span>

	<div class="ms-auto d-flex align-items-center gap-1">
		<Button
			color="link"
			class="text-white-50 text-decoration-none d-flex align-items-center gap-2 px-2"
			aria-label="Search issues"
			onclick={onsearch}
		>
			<i class="bi bi-search" aria-hidden="true"></i>
			<span class="d-none d-md-inline small">Search</span>
			<kbd class="d-none d-md-inline bg-transparent border border-secondary text-white-50 px-1 fw-normal"
				>{shortcut}</kbd
			>
		</Button>

		<Button
			color="link"
			href="/notifications"
			class="text-white text-decoration-none position-relative px-2"
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

		<Button
			color="link"
			class="text-white text-decoration-none px-2"
			aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
			title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
			onclick={() => setTheme(dark ? 'light' : 'dark')}
		>
			<i class="bi {dark ? 'bi-sun' : 'bi-moon-stars'} fs-5" aria-hidden="true"></i>
		</Button>

		<Dropdown>
			<DropdownToggle
				color="link"
				caret={false}
				class="text-white text-decoration-none d-flex align-items-center gap-2 px-2"
				aria-label="Account menu"
			>
				<Avatar login={user.name} avatarUrl={user.image} size={24} />
				<span class="d-none d-md-inline text-truncate" style="max-width: 8rem">{user.name}</span>
				<i class="bi bi-chevron-down small" aria-hidden="true"></i>
			</DropdownToggle>
			<DropdownMenu end>
				<DropdownItem header>
					<span class="d-block text-truncate fw-semibold">{user.name}</span>
					<span class="d-block text-truncate small text-body-secondary">{user.email}</span>
				</DropdownItem>
				<DropdownItem divider />
				<DropdownItem on:click={() => openSettings('/settings')}>
					<i class="bi bi-person me-2" aria-hidden="true"></i>Account
				</DropdownItem>
				<DropdownItem on:click={() => openSettings('/settings/appearance')}>
					<i class="bi bi-gear me-2" aria-hidden="true"></i>Settings
				</DropdownItem>
				<DropdownItem divider />
				<DropdownItem class="text-danger" on:click={() => void handleSignOut()}>
					<i class="bi bi-box-arrow-right me-2" aria-hidden="true"></i>Sign Out
				</DropdownItem>
			</DropdownMenu>
		</Dropdown>
	</div>
</header>
