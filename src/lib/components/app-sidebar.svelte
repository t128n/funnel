<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import CircleDotIcon from "@lucide/svelte/icons/circle-dot";
	import FunnelIcon from "@lucide/svelte/icons/funnel";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import KanbanIcon from "@lucide/svelte/icons/kanban";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import type { ComponentProps } from "svelte";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import NavTheme from "./nav-theme.svelte";
	import NavUser from "./nav-user.svelte";

	interface Props extends ComponentProps<typeof Sidebar.Root> {
		user: { id: string; name: string; email: string; image: string | null };
	}

	let { ref = $bindable(null), user, collapsible = "icon", ...restProps }: Props = $props();

	// Flat information architecture: three sibling views. "My Issues" is not a
	// root link — it lives as a segmented filter on the Issues view
	// (`/issues?assignee=me`).
	const views: {
		href: string;
		label: string;
		// This should be `Component` after @lucide/svelte updates types
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon: any;
	}[] = [
		{ href: "/inbox", label: "Inbox", icon: InboxIcon },
		{ href: "/issues", label: "Issues", icon: CircleDotIcon },
		{ href: "/board", label: "Board", icon: KanbanIcon },
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}

	function openNew() {
		void goto("/submit");
	}
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent="funnel">
					{#snippet child({ props })}
						<a href="/inbox" {...props}>
							<div
								class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
							>
								<FunnelIcon class="size-4" />
							</div>
							<span class="truncate font-medium">funnel</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent="New issue (C)" onclick={openNew}>
						<PlusIcon />
						<span>New issue</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>

		<Sidebar.Group>
			<Sidebar.Menu>
				{#each views as view (view.href)}
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={isActive(view.href)} tooltipContent={view.label}>
							{#snippet child({ props })}
								<a
									href={view.href}
									aria-current={isActive(view.href) ? "page" : undefined}
									{...props}
								>
									{#if view.icon}<view.icon />{/if}
									<span>{view.label}</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				{/each}
			</Sidebar.Menu>
		</Sidebar.Group>
	</Sidebar.Content>

	<Sidebar.Footer>
		<NavTheme />
		<NavUser {user} />
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
