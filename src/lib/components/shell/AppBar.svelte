<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import {
		Badge,
		Button,
		Collapse,
		DropdownItem,
		DropdownMenu,
		DropdownToggle,
		Nav,
		Navbar,
		NavbarBrand,
		NavbarToggler,
		NavItem,
		NavLink
	} from '@sveltestrap/sveltestrap';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import { globalSearch } from '#lib/client/global-search.svelte';
	import { resolvedTheme, setTheme, themeChoice, type ThemeChoice } from '#lib/client/theme';
	import { signOut } from '#lib/client/auth';
	import type { Role } from '#lib/roles';
	import NavDropdown from './NavDropdown.svelte';
	import {
		isNavActive,
		overflowDestination,
		OVERFLOW_NAV,
		PRIMARY_NAV
	} from './navigation';

	interface Props {
		user: { id: string; name: string; email: string; image: string | null; role: Role };
		inboxCount?: number;
		dueCount?: number;
		unread?: number;
		onsearch: () => void;
	}

	let { user, inboxCount = 0, dueCount = 0, unread = 0, onsearch }: Props = $props();

	/**
	 * Composition A's responsive menu is a one-layer Bootstrap collapse, not an
	 * off-canvas drawer and not a second navigation rail. Every path that
	 * navigates or opens search closes it, so the destination page is never
	 * hidden behind a stale expanded menu.
	 */
	let navOpen = $state(false);

	let isMac = $state(true);
	onMount(() => {
		isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
	});

	const dark = $derived($resolvedTheme === 'dark');
	const shortcut = $derived(isMac ? '⌘ K' : 'Ctrl K');
	const overflowActive = $derived(overflowDestination(page.url));

	/** Counts shown beside the Inbox link and the overflow Attention entry. */
	function countFor(href: string): number {
		if (href === '/inbox') return inboxCount;
		if (href === '/attention') return dueCount;
		return 0;
	}

	const themes: { value: ThemeChoice; label: string; icon: string }[] = [
		{ value: 'light', label: 'Light', icon: 'bi-sun' },
		{ value: 'dark', label: 'Dark', icon: 'bi-moon' },
		{ value: 'system', label: 'Match system', icon: 'bi-circle-half' }
	];

	async function handleSignOut() {
		closeNav();
		await signOut();
		await goto('/login');
	}

	function openSettings(path: string) {
		closeNav();
		void goto(path);
	}

	/**
	 * Close the collapsed menu and drop focus if it was on a menu item that is
	 * about to be hidden. The brand/toggler stay visible and keep their focus.
	 */
	function closeNav() {
		const wasOpen = navOpen;
		navOpen = false;
		if (!wasOpen || typeof document === 'undefined') return;
		const active = document.activeElement;
		if (active instanceof HTMLElement && active.closest('.navbar-collapse')) active.blur();
	}

	function openSearch() {
		closeNav();
		onsearch();
	}
</script>

<Navbar dark color="dark" expand="lg" class="app-bar py-2">
	<NavbarBrand href="/issues" class="fw-semibold mb-0" translate="no" onclick={closeNav}>
		funnel
	</NavbarBrand>
	<span class="vr d-none d-lg-block opacity-25 mx-1"></span>

	<NavbarToggler
		class="border-0 text-white"
		aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
		aria-expanded={navOpen}
		on:click={() => (navOpen = !navOpen)}
	>
		<i class="bi bi-list fs-4" aria-hidden="true"></i>
	</NavbarToggler>

	<Collapse navbar expand="lg" bind:isOpen={navOpen}>
		<Nav navbar class="me-auto">
			{#each PRIMARY_NAV as destination (destination.href)}
				<NavItem>
					<NavLink
						href={destination.href}
						active={isNavActive(destination, page.url)}
						aria-current={isNavActive(destination, page.url) ? 'page' : undefined}
						class="px-2"
						on:click={closeNav}
					>
						{destination.label}
						{#if countFor(destination.href) > 0}
							<span
								class="badge rounded-pill fw-normal text-white bg-white bg-opacity-10 border border-secondary-subtle ms-1"
							>
								{countFor(destination.href) > 99 ? '99+' : countFor(destination.href)}
								<span class="visually-hidden">waiting</span>
							</span>
						{/if}
					</NavLink>
				</NavItem>
			{/each}

			<NavItem>
				<NavDropdown>
					<DropdownToggle
						nav
						caret
						class="px-2 {overflowActive ? 'active' : ''}"
						aria-label={overflowActive
							? `More destinations, current: ${overflowActive.label}`
							: 'More destinations'}
					>
						More
					</DropdownToggle>
					<DropdownMenu end>
						<h6 class="dropdown-header">More destinations</h6>
						{#each OVERFLOW_NAV as destination (destination.href)}
							<DropdownItem
								href={destination.href}
								active={isNavActive(destination, page.url)}
								aria-current={isNavActive(destination, page.url) ? 'page' : undefined}
								on:click={closeNav}
							>
								{destination.label}
								{#if countFor(destination.href) > 0}
									<Badge color="secondary" class="ms-2">
										{countFor(destination.href) > 99 ? '99+' : countFor(destination.href)}
									</Badge>
								{/if}
							</DropdownItem>
						{/each}
					</DropdownMenu>
				</NavDropdown>
			</NavItem>
		</Nav>

		<div class="d-flex flex-wrap align-items-center gap-2 py-2 py-lg-0">
			<Button
				id="global-search-trigger"
				color="link"
				size="sm"
				class="nav-quiet d-flex align-items-center gap-2 text-decoration-none"
				aria-label="Search issues"
				aria-controls="global-search-panel"
				aria-expanded={globalSearch.open}
				onclick={openSearch}
			>
				<i class="bi bi-search" aria-hidden="true"></i>
				<span class="d-none d-md-inline">Search</span>
				<kbd class="nav-kbd d-none d-lg-inline">{shortcut}</kbd>
			</Button>

			<Button
				color="link"
				size="sm"
				href="/notifications"
				class="nav-quiet position-relative text-decoration-none"
				aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
				onclick={closeNav}
			>
				<i class="bi bi-bell" aria-hidden="true"></i>
				{#if unread > 0}
					<span
						class="badge rounded-pill text-bg-danger position-absolute top-0 start-100 translate-middle"
					>
						{unread > 99 ? '99+' : unread}
						<span class="visually-hidden">unread</span>
					</span>
				{/if}
			</Button>

			<NavDropdown>
				<DropdownToggle
					color="link"
					size="sm"
					caret={false}
					class="nav-quiet text-decoration-none"
					aria-label="Theme"
					title="Theme"
				>
					<i class="bi {dark ? 'bi-moon' : 'bi-sun'}" aria-hidden="true"></i>
				</DropdownToggle>
				<DropdownMenu end>
					<DropdownItem header>Theme</DropdownItem>
					{#each themes as theme (theme.value)}
						<DropdownItem
							class="d-flex align-items-center gap-2"
							role="menuitemradio"
							aria-checked={$themeChoice === theme.value}
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
			</NavDropdown>

			<NavDropdown>
				<DropdownToggle
					color="link"
					size="sm"
					caret={false}
					class="nav-quiet d-flex align-items-center gap-2 text-decoration-none"
					aria-label="Account menu"
				>
					<Avatar login={user.name} avatarUrl={user.image} size={24} />
					<span class="d-none d-xl-inline text-truncate" style="max-width: 10rem">{user.name}</span>
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
			</NavDropdown>
		</div>
	</Collapse>
</Navbar>
