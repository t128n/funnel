<script lang="ts">
	import { page } from "$app/state";
	import AlarmClockIcon from "@lucide/svelte/icons/alarm-clock";
	import BellRingIcon from "@lucide/svelte/icons/bell-ring";
	import CircleDotIcon from "@lucide/svelte/icons/circle-dot";
	import FunnelIcon from "@lucide/svelte/icons/funnel";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import KanbanIcon from "@lucide/svelte/icons/kanban";
	import MilestoneIcon from "@lucide/svelte/icons/milestone";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SearchIcon from "@lucide/svelte/icons/search";
	import UserIcon from "@lucide/svelte/icons/user";
	import type { ComponentProps } from "svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import NavItem from "#lib/components/nav/nav-item.svelte";
	import NavSection from "#lib/components/nav/nav-section.svelte";
	import { isWorkspaceCollapsed, toggleWorkspace } from "#lib/client/sidebar-prefs.svelte";
	import { canWrite, type Role } from "#lib/roles";
	import { viewOf } from "#lib/issue-url";
	import NavUser from "./nav-user.svelte";

	/** One sidebar destination, shared shape for both scoped blocks. */
	interface NavLink {
		href: string;
		label: string;
		// Lucide icon components are not typed as `Component` yet.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon: any;
		active: boolean;
		badge?: number;
		tone?: "neutral" | "destructive";
	}

	interface Props extends ComponentProps<typeof Sidebar.Root> {
		user: { id: string; name: string; email: string; image: string | null; role: Role };
		/** Count of overdue + due-today re-checks, for the Attention badge. */
		dueCount?: number;
		/** Pending submissions + untriaged issues, for the Inbox badge. */
		inboxCount?: number;
		/** The viewer's unread notifications, for the Notifications badge. */
		unreadNotifications?: number;
		/** Focus the shared search; wired to the global `Mod+K` / `/`. */
		onSearch?: () => void;
		/** Open the new-issue flow; wired to the global `C`. */
		onNewIssue?: () => void;
	}

	let {
		ref = $bindable(null),
		user,
		dueCount = 0,
		inboxCount = 0,
		unreadNotifications,
		onSearch,
		onNewIssue,
		collapsible = "icon",
		...restProps
	}: Props = $props();

	const path = $derived(page.url.pathname);
	// The layout load owns the count. The prop lets a parent pass it explicitly;
	// otherwise read the same field from the shared page data, so the badge still
	// updates after `invalidateAll()` without a second data path.
	const unread = $derived(
		unreadNotifications ??
			(page.data as { unreadNotifications?: number }).unreadNotifications ??
			0
	);
	// `assignee=me` scopes the Issues feed to the viewer. It is the only
	// personal variant of a shared view, so Issues yields its highlight to it.
	const mine = $derived(
		path === "/issues" && page.url.searchParams.get("assignee") === "me"
	);

	const inboxActive = $derived(viewOf(path) === "inbox");
	const issuesActive = $derived(viewOf(path) === "issues" && !mine);
	const boardActive = $derived(viewOf(path) === "board");
	const milestonesActive = $derived(path.startsWith("/milestones"));
	const attentionActive = $derived(path.startsWith("/attention"));
	const notificationsActive = $derived(path.startsWith("/notifications"));
	const workspaceCollapsed = $derived(isWorkspaceCollapsed());
	// `read` viewers may browse but not start the new-issue flow.
	const mayWrite = $derived(canWrite(user.role));

	// Personal, daily touchpoints — unlabeled because they are universal.
	const personal: NavLink[] = $derived([
		{
			href: "/inbox",
			label: "Inbox",
			icon: InboxIcon,
			active: inboxActive,
			badge: inboxCount
		},
		{ href: "/issues?assignee=me", label: "My Issues", icon: UserIcon, active: mine },
		{
			href: "/notifications",
			label: "Notifications",
			icon: BellRingIcon,
			active: notificationsActive,
			badge: unread
		},
		{
			href: "/attention",
			label: "Attention",
			icon: AlarmClockIcon,
			active: attentionActive,
			badge: dueCount,
			tone: "destructive"
		}
	]);

	// Organisational scope: the shared issue streams.
	const workspace: NavLink[] = $derived([
		{ href: "/issues", label: "Issues", icon: CircleDotIcon, active: issuesActive },
		{ href: "/board", label: "Board", icon: KanbanIcon, active: boardActive },
		{
			href: "/milestones",
			label: "Milestones",
			icon: MilestoneIcon,
			active: milestonesActive
		}
	]);
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header class="flex-row items-center gap-1">
		<Sidebar.Menu class="min-w-0 flex-1">
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent="funnel">
					{#snippet child({ props })}
						<a href="/" {...props}>
							<div
								class="flex aspect-square size-8 items-center justify-center rounded-lg bg-foreground text-background"
							>
								<FunnelIcon class="size-4" />
							</div>
							<span class="truncate font-medium">funnel</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>

		<!-- Global primary actions stay pinned top-right (Fitts' law) and mirror
		     the `Mod+K` / `C` shortcuts the shell already registers. -->
		<div class="group-data-[collapsible=icon]:hidden flex shrink-0 items-center gap-0.5">
			<Button
				variant="ghost"
				size="icon-sm"
				title="Search"
				aria-label="Search issues"
				onclick={() => onSearch?.()}
			>
				<SearchIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				title={mayWrite ? "New issue" : "New issue (requires write access)"}
				aria-label="New issue"
				disabled={!mayWrite}
				onclick={() => mayWrite && onNewIssue?.()}
			>
				<PlusIcon />
			</Button>
		</div>
	</Sidebar.Header>

	<Sidebar.Content>
		<NavSection>
			{#each personal as item (item.href)}
				<NavItem {...item} />
			{/each}
		</NavSection>

		<NavSection
			label="Workspace"
			collapsed={workspaceCollapsed}
			onToggle={toggleWorkspace}
			class="border-t border-[color:var(--sidebar-border)]"
		>
			{#each workspace as item (item.href)}
				<NavItem {...item} />
			{/each}
		</NavSection>
	</Sidebar.Content>

	<Sidebar.Footer>
		<NavUser {user} />
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
