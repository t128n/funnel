<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import { settingsGroups } from '#lib/components/settings/sections';
	import { hasRole } from '#lib/roles';
	import type { LayoutProps } from './$types';

	/**
	 * Settings shell: a two-pane surface inside the app shell. The desktop nav
	 * is a 12.5 rem `surface` column grouped Personal / Workspace / System; below
	 * 1024 px it becomes one labelled NativeSelect. h1 comes from the active
	 * section. The server layout still enforces admin-only sections for direct
	 * URLs, and the nav filters anything the viewer cannot open.
	 */
	let { data, children }: LayoutProps = $props();

	const groups = $derived(
		settingsGroups
			.map((group) => ({
				...group,
				sections: group.sections.filter((section) =>
					hasRole(data.user.role, section.minRole)
				)
			}))
			.filter((group) => group.sections.length > 0)
	);

	const sections = $derived(groups.flatMap((group) => group.sections));

	const active = $derived(
		sections.find((section) => page.url.pathname === section.href) ??
			sections.find((section) => page.url.pathname.startsWith(`${section.href}/`)) ??
			sections[0]
	);

	function navigateTo(event: Event): void {
		const target = event.currentTarget as HTMLSelectElement;
		if (target.value !== page.url.pathname) void goto(target.value);
	}
</script>

<PageHead title={`${active.label} · Settings`} />

<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
	<PageHeader title={active.label} description={active.description} />

	<div class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
		<nav
			class="hidden w-[var(--layout-settings-nav)] shrink-0 overflow-y-auto border-r border-border-subtle bg-surface py-4 lg:block"
			aria-label="Settings"
		>
			{#each groups as group (group.id)}
				<div class="mb-2">
					<p class="px-3 pb-1 text-caption font-semibold text-fg-secondary">{group.label}</p>
					<ul>
						{#each group.sections as section (section.id)}
							{@const Icon = section.icon}
							<li>
								<a
									href={section.href}
									aria-current={active.id === section.id ? 'page' : undefined}
									class="flex h-9 items-center gap-2 px-3 text-body text-fg {active.id ===
									section.id
										? 'is-selected-nav'
										: 'hover:bg-surface-2'}"
								>
									<span class="flex size-4 shrink-0 items-center justify-center">
										<Icon class="size-4" aria-hidden="true" />
									</span>
									<span class="truncate">{section.label}</span>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</nav>

		<div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
			<div class="px-[var(--layout-page-padding)] py-6">
				<div class="mb-6 flex max-w-[var(--layout-form-max)] flex-col gap-1 lg:hidden">
					<label class="text-caption font-semibold text-fg-secondary" for="settings-section">
						Settings section
					</label>
					<NativeSelect.Root
						id="settings-section"
						value={active.href}
						onchange={navigateTo}
						class="w-full"
					>
						{#each groups as group (group.id)}
							<NativeSelect.OptGroup label={group.label}>
								{#each group.sections as section (section.id)}
									<NativeSelect.Option value={section.href}>
										{section.label}
									</NativeSelect.Option>
								{/each}
							</NativeSelect.OptGroup>
						{/each}
					</NativeSelect.Root>
				</div>

				<div class="w-full max-w-[var(--layout-settings-max)]">
					{@render children()}
				</div>
			</div>
		</div>
	</div>
</div>
