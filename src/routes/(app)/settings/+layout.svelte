<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import * as Sidebar from '#lib/components/ui/sidebar';
	import { settingsSections } from '#lib/components/settings/sections';
	import type { LayoutProps } from './$types';

	/**
	 * Settings shell: the section nav on the left, the active section on the
	 * right — the same two-pane layout the old settings dialog used, promoted to
	 * a full page with one route per section.
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
	<Sidebar.Root collapsible="none" class="hidden md:flex">
		<Sidebar.Content>
			<Sidebar.Group>
				<Sidebar.GroupLabel>Settings</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each settingsSections as section (section.id)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={active.id === section.id} tooltipContent={section.label}>
									{#snippet child({ props })}
										<a
											href={section.href}
											aria-current={active.id === section.id ? 'page' : undefined}
											{...props}
										>
											<section.icon />
											<span>{section.label}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		</Sidebar.Content>
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
				{#each settingsSections as section (section.id)}
					<NativeSelect.Option value={section.href}>{section.label}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</header>

		<div class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
			{@render children()}
		</div>
	</main>
</Sidebar.Provider>
