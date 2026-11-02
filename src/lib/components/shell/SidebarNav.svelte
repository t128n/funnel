<script lang="ts">
	import { page } from "$app/state";
	import BellIcon from "@lucide/svelte/icons/bell";
	import CalendarRangeIcon from "@lucide/svelte/icons/calendar-range";
	import CircleDotIcon from "@lucide/svelte/icons/circle-dot";
	import FlagIcon from "@lucide/svelte/icons/flag";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import KanbanIcon from "@lucide/svelte/icons/kanban";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import LayoutListIcon from "@lucide/svelte/icons/layout-list";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import Grid2x2Icon from "@lucide/svelte/icons/grid-2x2";

	interface NavLink {
		href: string;
		label: string;
		active: boolean;
		count?: number;
		icon: typeof InboxIcon;
	}

	interface Props {
		inboxCount?: number;
		dueCount?: number;
		unread?: number;
		onNavigate?: () => void;
	}

	let { inboxCount = 0, dueCount = 0, unread = 0, onNavigate }: Props = $props();

	const path = $derived(page.url.pathname);
	const mine = $derived(path === "/issues" && page.url.searchParams.get("assignee") === "me");

	const personal: NavLink[] = $derived([
		{ href: "/inbox", label: "Inbox", active: path.startsWith("/inbox"), count: inboxCount, icon: InboxIcon },
		{ href: "/issues?assignee=me", label: "My Issues", active: mine, icon: CircleDotIcon },
		{
			href: "/notifications",
			label: "Notifications",
			active: path.startsWith("/notifications"),
			count: unread,
			icon: BellIcon
		},
		{
			href: "/attention",
			label: "Attention",
			active: path.startsWith("/attention"),
			count: dueCount,
			icon: TriangleAlertIcon
		}
	]);

	const workspace: NavLink[] = $derived([
		{ href: "/issues", label: "Issues", active: path.startsWith("/issues") && !mine, icon: LayoutListIcon },
		{ href: "/board", label: "Board", active: path.startsWith("/board"), icon: KanbanIcon },
		{ href: "/matrix", label: "Matrix", active: path.startsWith("/matrix"), icon: Grid2x2Icon },
		{ href: "/plan", label: "Plan", active: path.startsWith("/plan"), icon: CalendarRangeIcon },
		{ href: "/epics", label: "Epics", active: path.startsWith("/epics"), icon: LayersIcon },
		{ href: "/milestones", label: "Milestones", active: path.startsWith("/milestones"), icon: FlagIcon }
	]);

	const settingsActive = $derived(path.startsWith("/settings"));
</script>

<nav class="flex h-full flex-col overflow-y-auto px-3 py-4" aria-label="Primary">
	<div class="flex flex-col gap-0.5">
		{#each personal as item (item.href)}
			{@render navItem(item)}
		{/each}
	</div>

	<div class="mt-5 flex flex-col gap-0.5">
		<h2 class="px-2 pb-1 text-caption font-semibold text-fg-secondary">Workspace</h2>
		{#each workspace as item (item.href)}
			{@render navItem(item)}
		{/each}
	</div>

	<div class="mt-5 border-t border-border-subtle pt-3">
		<a
			href="/settings"
			class="nav-link"
			class:nav-link-active={settingsActive}
			aria-current={settingsActive ? "page" : undefined}
			onclick={onNavigate}
		>
			<span class="nav-icon"><SettingsIcon class="size-4" /></span>
			<span class="min-w-0 flex-1 truncate">Settings</span>
		</a>
	</div>
</nav>

{#snippet navItem(item: NavLink)}
	<a
		href={item.href}
		class="nav-link"
		class:nav-link-active={item.active}
		aria-current={item.active ? "page" : undefined}
		onclick={onNavigate}
	>
		<span class="nav-icon"><item.icon class="size-4" /></span>
		<span class="min-w-0 flex-1 truncate">{item.label}</span>
		{#if item.count && item.count > 0}
			<span class="shrink-0 text-caption text-fg-secondary tabular-nums">
				{item.count > 99 ? "99+" : item.count}
			</span>
		{/if}
	</a>
{/snippet}

<style>
	.nav-link {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--size-control-sm);
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: var(--font-size-body);
		line-height: var(--font-leading-interface);
		text-decoration: none;
	}

	.nav-icon {
		display: inline-flex;
		width: var(--icon-sm);
		height: var(--icon-sm);
		flex: none;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
	}

	@media (hover: hover) and (pointer: fine) {
		.nav-link:hover {
			background: var(--color-surface-2);
			color: var(--color-text-primary);
		}

		.nav-link:hover .nav-icon {
			color: var(--color-text-secondary);
		}
	}

	.nav-link-active,
	.nav-link-active:hover {
		background: var(--color-surface-3);
		box-shadow: inset 2px 0 0 0 var(--color-primary);
		color: var(--color-text-primary);
		font-weight: var(--font-weight-semibold);
	}

	.nav-link-active .nav-icon,
	.nav-link-active:hover .nav-icon {
		color: var(--color-primary);
	}
</style>
