<script lang="ts">
	import { page } from "$app/state";
	import type { ComponentProps } from "svelte";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import NavItem from "#lib/components/nav/nav-item.svelte";
	import NavSection from "#lib/components/nav/nav-section.svelte";
	import { isWorkspaceCollapsed, toggleWorkspace } from "#lib/client/sidebar-prefs.svelte";
	import { canWrite, type Role } from "#lib/roles";
	import { viewOf } from "#lib/issue-url";
	import NavUser from "./nav-user.svelte";

	/**
	 * One sidebar destination, shared shape for both scoped blocks.
	 *
	 * Bugzilla chrome: text only, no icon components.
	 */
	interface NavLink {
		href: string;
		label: string;
		active: boolean;
		badge?: number;
	}

	interface Props extends ComponentProps<typeof Sidebar.Root> {
		user: { id: string; name: string; email: string; image: string | null; role: Role };
		/** Count of overdue + due-today re-checks, for the Attention count (never unscheduled rows). */
		dueCount?: number;
		/** Pending submissions + untriaged issues, for the Inbox count. */
		inboxCount?: number;
		/** The viewer's unread notifications, for the Notifications count. */
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
	// otherwise read the same field from the shared page data, so the count still
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
	const matrixActive = $derived(viewOf(path) === "matrix");
	const planActive = $derived(path.startsWith("/plan"));
	const epicsActive = $derived(path.startsWith("/epics"));
	const milestonesActive = $derived(path.startsWith("/milestones"));
	const attentionActive = $derived(path.startsWith("/attention"));
	const notificationsActive = $derived(path.startsWith("/notifications"));
	const workspaceCollapsed = $derived(isWorkspaceCollapsed());
	// `read` viewers may browse but not start the new-issue flow.
	const mayWrite = $derived(canWrite(user.role));

	// Personal, daily touchpoints — unlabeled because they are universal.
	const personal: NavLink[] = $derived([
		{ href: "/inbox", label: "Inbox", active: inboxActive, badge: inboxCount },
		{ href: "/issues?assignee=me", label: "My Issues", active: mine },
		{ href: "/notifications", label: "Notifications", active: notificationsActive, badge: unread },
		{ href: "/attention", label: "Attention", active: attentionActive, badge: dueCount }
	]);

	// Organisational scope: the shared issue streams.
	const workspace: NavLink[] = $derived([
		{ href: "/issues", label: "Issues", active: issuesActive },
		{ href: "/board", label: "Board", active: boardActive },
		{ href: "/matrix", label: "Matrix", active: matrixActive },
		{ href: "/plan", label: "Plan", active: planActive },
		{ href: "/epics", label: "Epics", active: epicsActive },
		{ href: "/milestones", label: "Milestones", active: milestonesActive }
	]);
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header class="flex-col gap-1 border-b border-[color:var(--border)]">
		<Sidebar.Menu class="min-w-0">
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent="funnel">
					{#snippet child({ props })}
						<a href="/" {...props}>
							<span class="group-data-[collapsible=icon]:hidden truncate font-semibold tracking-tight">
								funnel
							</span>
							<span
								aria-hidden="true"
								class="group-data-[collapsible=icon]:inline hidden font-semibold tracking-tight"
							>
								f
							</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>

		<!-- Global primary actions mirror the `Mod+K` / `C` shortcuts. Text
		     links, not icon buttons; a read viewer sees muted text. -->
		<div class="group-data-[collapsible=icon]:hidden flex items-center gap-3 px-2 text-xs">
			<button
				type="button"
				class="{mayWrite ? 'text-foreground hover:underline' : 'text-muted-foreground cursor-default'}"
				title={mayWrite ? "New issue" : "New issue (requires write access)"}
				disabled={!mayWrite}
				onclick={() => mayWrite && onNewIssue?.()}
			>
				New Issue
			</button>
			<button type="button" class="text-foreground hover:underline" onclick={() => onSearch?.()}>
				Search
			</button>
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
