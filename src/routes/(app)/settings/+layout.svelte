<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Nav, NavItem, NavLink } from '@sveltestrap/sveltestrap';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { settingsGroups } from '#lib/components/settings/sections';
	import { hasRole } from '#lib/roles';
	import type { LayoutProps } from './$types';

	/**
	 * Settings shell: a two-pane surface inside the app shell. The desktop nav
	 * is a light Bootstrap `nav-pills` column grouped Personal / Workspace /
	 * System; below 992 px it becomes one labelled `form-select` switcher. h1
	 * comes from the active section. The server layout still enforces
	 * admin-only sections for direct URLs, and the nav filters anything the
	 * viewer cannot open.
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

<!-- The nav starts directly under the app bar; the title lives in the content
     column so the surface column and canvas meet at one edge instead of a
     full-width header band. The nav's top inset aligns “Personal” with the h1. -->
<div class="d-flex flex-grow-1 min-h-0 min-w-0 overflow-hidden">
	<nav
		class="settings-nav d-none d-lg-block flex-shrink-0 overflow-y-auto border-end bg-body-tertiary pt-3 pb-3"
		aria-label="Settings"
	>
		{#each groups as group (group.id)}
			<div class="mb-2">
				<p class="px-2 pb-1 mb-0 small fw-semibold text-body-secondary">{group.label}</p>
				<Nav vertical pills class="app-nav flex-column gap-1">
					{#each group.sections as section (section.id)}
						<NavItem>
							<NavLink
								href={section.href}
								active={active.id === section.id}
								aria-current={active.id === section.id ? 'page' : undefined}
								class="d-flex align-items-center gap-2"
							>
								<i class="bi {section.icon}" aria-hidden="true"></i>
								<span class="text-truncate">{section.label}</span>
							</NavLink>
						</NavItem>
					{/each}
				</Nav>
			</div>
		{/each}
	</nav>

	<div class="min-h-0 min-w-0 flex-grow-1 overflow-y-auto">
		<PageHeader title={active.label} description={active.description} />

		<div class="px-3 pb-4">
			<div class="d-lg-none mb-4 settings-measure">
				<label class="form-label small fw-semibold text-body-secondary" for="settings-section">
					Settings section
				</label>
				<select
					id="settings-section"
					class="form-select"
					value={active.href}
					onchange={navigateTo}
				>
					{#each groups as group (group.id)}
						<optgroup label={group.label}>
							{#each group.sections as section (section.id)}
								<option value={section.href}>{section.label}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</div>

			<div class="w-100 settings-measure">
				{@render children()}
			</div>
		</div>
	</div>
</div>

<style>
	.settings-nav {
		width: var(--funnel-settings-nav-width);
		flex: 0 0 var(--funnel-settings-nav-width);
	}
</style>
