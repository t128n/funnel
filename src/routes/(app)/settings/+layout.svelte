<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import NavItem from '#lib/components/nav/nav-item.svelte';
	import NavSection from '#lib/components/nav/nav-section.svelte';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import * as Sidebar from '#lib/components/ui/sidebar';
	import { settingsGroups, settingsSections } from '#lib/components/settings/sections';
	import type { LayoutProps } from './$types';

	/**
	 * Settings shell: the scoped section nav on the left, the active section on
	 * the right. The nav mirrors the cockpit's grouping (personal → workspace →
	 * system) by reusing the same `NavSection`/`NavItem` components.
	 */
	let { children }: LayoutProps = $props();

	const active = $derived(
		settingsSections.find((section) => page.url.pathname === section.href) ?? settingsSections[0]
	);

	function navigate(href: string) {
		void goto(href);
	}
</script>

<Sidebar.Provider class="h-full min-h-0 flex-1 items-start" style="--sidebar-width: 15rem">
	<!-- Match the other views' list surface (`surface-shell` + `--surface-canvas`)
	     instead of the muted sidebar grey, so the section nav reads as a list. -->
	<Sidebar.Root collapsible="none" class="surface-shell bg-[var(--surface-canvas)]! hidden md:flex">
		<!-- List header, matching the feed columns (Issues / Inbox / Attention). -->
		<header
			class="border-[color:var(--surface-divider)] flex h-11 shrink-0 items-center gap-2 border-b px-3"
		>
			<h1 class="text-base font-semibold tracking-tight">Settings</h1>
		</header>

		<Sidebar.Content>
			{#each settingsGroups as group (group.id)}
				<NavSection label={group.label} collapsible={false}>
					{#each group.sections as section (section.id)}
						<NavItem
							href={section.href}
							label={section.label}
							icon={section.icon}
							active={active.id === section.id}
							class="hover:bg-[var(--surface-tag-bg)] data-active:bg-[var(--surface-card-hover)]"
						/>
					{/each}
				</NavSection>
			{/each}
		</Sidebar.Content>

		<Sidebar.Footer>
			<Sidebar.Menu>
				<NavItem href="/issues" label="Back to cockpit" icon={ArrowLeftIcon} />
			</Sidebar.Menu>
		</Sidebar.Footer>
	</Sidebar.Root>

	<main class="flex h-full max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
		<header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
			<Breadcrumb.Root>
				<Breadcrumb.List>
					<Breadcrumb.Item class="hidden md:block">
						<span class="text-muted-foreground">Settings</span>
					</Breadcrumb.Item>
					<Breadcrumb.Separator class="hidden md:block" />
					<Breadcrumb.Item>
						<Breadcrumb.Page>{active.label}</Breadcrumb.Page>
					</Breadcrumb.Item>
				</Breadcrumb.List>
			</Breadcrumb.Root>

			<!-- Below `md` the section nav is hidden, so offer a compact switcher. -->
			<NativeSelect.Root
				class="ms-auto w-40 md:hidden"
				value={active.href}
				onchange={(event) => navigate((event.currentTarget as HTMLSelectElement).value)}
				aria-label="Settings section"
			>
				{#each settingsGroups as group (group.id)}
					<NativeSelect.OptGroup label={group.label ?? 'Settings'}>
						{#each group.sections as section (section.id)}
							<NativeSelect.Option value={section.href}>{section.label}</NativeSelect.Option>
						{/each}
					</NativeSelect.OptGroup>
				{/each}
			</NativeSelect.Root>
		</header>

		<div class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
			{@render children()}
		</div>
	</main>
</Sidebar.Provider>
