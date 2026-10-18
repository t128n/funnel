<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import MessageSquareIcon from "@lucide/svelte/icons/message-square";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import { useSidebar } from "#lib/components/ui/sidebar/index.js";
	import { COMMENT_UI_COOKIE, COMMENT_UI_OPTIONS, type CommentUi } from "#lib/comment-ui";

	interface Props {
		/** The comment rendering the server resolved for this request. */
		value: CommentUi;
	}

	let { value }: Props = $props();

	/** Label of the active choice, shown on the trigger. */
	const currentLabel = $derived(
		COMMENT_UI_OPTIONS.find((option) => option.value === value)?.label ?? "Compact list"
	);

	const sidebar = useSidebar();

	/**
	 * Persist the choice to the cookie the layout load reads, then invalidate so
	 * the flag is re-evaluated and the Inspector re-renders.
	 */
	function select(next: string) {
		document.cookie = `${COMMENT_UI_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
		void invalidateAll();
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						tooltipContent="Comments"
						{...props}
					>
						<MessageSquareIcon />
						<span>Comments</span>
						<span class="ms-auto text-xs text-muted-foreground">{currentLabel}</span>
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-44"
				side={sidebar.isMobile ? "bottom" : "right"}
				align="end"
				sideOffset={4}
			>
				<DropdownMenu.RadioGroup {value} onValueChange={select}>
					{#each COMMENT_UI_OPTIONS as option (option.value)}
						<DropdownMenu.RadioItem value={option.value}>{option.label}</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
