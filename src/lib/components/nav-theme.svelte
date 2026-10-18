<script lang="ts">
	import PaletteIcon from "@lucide/svelte/icons/palette";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "#lib/components/ui/sidebar/index.js";
	import { useSidebar } from "#lib/components/ui/sidebar/index.js";
	import { setTheme, themeChoice, type ThemeChoice } from "#lib/client/theme";

	const options: { value: ThemeChoice; label: string }[] = [
		{ value: "system", label: "System" },
		{ value: "dark", label: "Dark" },
		{ value: "light", label: "Light" },
	];

	/** Label of the active theme, shown on the trigger. */
	const currentLabel = $derived(
		options.find((option) => option.value === $themeChoice)?.label ?? "System"
	);

	const sidebar = useSidebar();
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						tooltipContent="Theme"
						{...props}
					>
						<PaletteIcon />
						<span>Theme</span>
						<span class="ms-auto text-xs text-muted-foreground">{currentLabel}</span>
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-40"
				side={sidebar.isMobile ? "bottom" : "right"}
				align="end"
				sideOffset={4}
			>
				<DropdownMenu.RadioGroup
					value={$themeChoice}
					onValueChange={(value) => setTheme(value as ThemeChoice)}
				>
					{#each options as option (option.value)}
						<DropdownMenu.RadioItem value={option.value}>{option.label}</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
