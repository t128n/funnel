<script lang="ts">
	import { page } from "$app/state";
	import CircleDotIcon from "@lucide/svelte/icons/circle-dot";
	import FunnelIcon from "@lucide/svelte/icons/funnel";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import KanbanIcon from "@lucide/svelte/icons/kanban";
	import type { ComponentProps } from "svelte";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import { viewOf } from "#lib/issue-url";
	import { cn } from "#lib/utils.js";
	import NavUser from "./nav-user.svelte";

	interface Props extends ComponentProps<typeof Sidebar.Root> {
		user: { id: string; name: string; email: string; image: string | null };
	}

	let {
		ref = $bindable(null),
		user,
		collapsible = "icon",
		...restProps
	}: Props = $props();

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
		// Highlight the owning view for its detail sub-routes too, e.g.
		// `/issues/<owner>/<repo>/<n>` keeps Issues active.
		return viewOf(page.url.pathname) === href.slice(1);
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
	</Sidebar.Header>

	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Views</Sidebar.GroupLabel>
			<Sidebar.Menu>
				{#each views as view (view.href)}
					<Sidebar.MenuItem
						class={cn(
							"before:absolute before:inset-y-0 before:start-0 before:w-0.5 before:bg-sidebar-primary",
							isActive(view.href) ? "before:opacity-100" : "before:opacity-0"
						)}
					>
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
		<NavUser {user} />
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
