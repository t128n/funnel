<script lang="ts">
	import { page } from '$app/state';
	import { Nav, NavItem, NavLink } from '@sveltestrap/sveltestrap';

	interface NavEntry {
		href: string;
		label: string;
		active: boolean;
		count?: number;
		icon: string;
	}

	interface Props {
		inboxCount?: number;
		dueCount?: number;
		unread?: number;
		onNavigate?: () => void;
	}

	let { inboxCount = 0, dueCount = 0, unread = 0, onNavigate }: Props = $props();

	const path = $derived(page.url.pathname);
	const mine = $derived(path === '/issues' && page.url.searchParams.get('assignee') === 'me');

	const personal: NavEntry[] = $derived([
		{ href: '/inbox', label: 'Inbox', active: path.startsWith('/inbox'), count: inboxCount, icon: 'bi-inbox' },
		{ href: '/issues?assignee=me', label: 'My Issues', active: mine, icon: 'bi-record-circle' },
		{
			href: '/notifications',
			label: 'Notifications',
			active: path.startsWith('/notifications'),
			count: unread,
			icon: 'bi-bell'
		},
		{
			href: '/attention',
			label: 'Attention',
			active: path.startsWith('/attention'),
			count: dueCount,
			icon: 'bi-exclamation-triangle'
		}
	]);

	const workspace: NavEntry[] = $derived([
		{ href: '/issues', label: 'Issues', active: path.startsWith('/issues') && !mine, icon: 'bi-list-task' },
		{ href: '/board', label: 'Board', active: path.startsWith('/board'), icon: 'bi-kanban' },
		{ href: '/matrix', label: 'Matrix', active: path.startsWith('/matrix'), icon: 'bi-grid-3x3' },
		{ href: '/plan', label: 'Plan', active: path.startsWith('/plan'), icon: 'bi-calendar-range' },
		{ href: '/epics', label: 'Epics', active: path.startsWith('/epics'), icon: 'bi-layers' },
		{ href: '/milestones', label: 'Milestones', active: path.startsWith('/milestones'), icon: 'bi-flag' },
		{ href: '/timeline', label: 'Timeline', active: path.startsWith('/timeline'), icon: 'bi-bar-chart-steps' }
	]);

	const settingsActive = $derived(path.startsWith('/settings'));
</script>

<nav class="h-100 d-flex flex-column p-2" aria-label="Primary">
	<div class="sidebar-heading">Personal</div>
	<Nav vertical pills class="app-nav flex-column gap-1">
		{#each personal as item (item.href)}
			<NavItem>
				<NavLink
					href={item.href}
					active={item.active}
					aria-current={item.active ? 'page' : undefined}
					on:click={() => onNavigate?.()}
				>
					<i class="bi {item.icon}" aria-hidden="true"></i>
					<span class="flex-grow-1 text-truncate">{item.label}</span>
					{#if item.count && item.count > 0}
						<span class="badge text-bg-secondary rounded-pill ms-auto">
							{item.count > 99 ? '99+' : item.count}
						</span>
					{/if}
				</NavLink>
			</NavItem>
		{/each}
	</Nav>

	<div class="sidebar-heading mt-4">Workspace</div>
	<Nav vertical pills class="app-nav flex-column gap-1">
		{#each workspace as item (item.href)}
			<NavItem>
				<NavLink
					href={item.href}
					active={item.active}
					aria-current={item.active ? 'page' : undefined}
					on:click={() => onNavigate?.()}
				>
					<i class="bi {item.icon}" aria-hidden="true"></i>
					<span class="text-truncate">{item.label}</span>
				</NavLink>
			</NavItem>
		{/each}
	</Nav>

	<div class="mt-auto pt-3 border-top">
		<div class="sidebar-heading mt-2">Configuration</div>
		<Nav vertical pills class="app-nav flex-column">
			<NavItem>
				<NavLink
					href="/settings"
					active={settingsActive}
					aria-current={settingsActive ? 'page' : undefined}
					on:click={() => onNavigate?.()}
				>
					<i class="bi bi-gear" aria-hidden="true"></i>
					<span>Settings</span>
				</NavLink>
			</NavItem>
		</Nav>
	</div>
</nav>
