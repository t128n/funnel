<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Input, Nav, NavItem, NavLink } from '@sveltestrap/sveltestrap';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { settingsGroups } from '#lib/components/settings/sections';
	import { hasRole } from '#lib/roles';
	import type { LayoutProps } from './$types';

	/**
	 * Settings shell: a two-pane surface inside the app shell. The desktop nav
	 * is a plain Bootstrap `nav-pills` column grouped Personal / Workspace /
	 * System; below 992 px it becomes one labelled section switcher. The h1
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
     full-width header band. -->
<div class="d-flex flex-grow-1 min-h-0 min-w-0 overflow-hidden">
	<nav
		class="d-none d-lg-block flex-shrink-0 overflow-y-auto border-end bg-body-tertiary px-2 py-2"
		style="width: var(--funnel-settings-nav-width)"
		aria-label="Settings"
	>
		{#each groups as group (group.id)}
			<div class="sidebar-heading">{group.label}</div>
			<Nav vertical pills class="app-nav">
				{#each group.sections as section (section.id)}
					<NavItem>
						<NavLink
							href={section.href}
							active={active.id === section.id}
							aria-current={active.id === section.id ? 'page' : undefined}
							class="text-truncate"
						>
							{section.label}
						</NavLink>
					</NavItem>
				{/each}
			</Nav>
		{/each}
	</nav>

	<div class="min-h-0 min-w-0 flex-grow-1 overflow-y-auto">
		<PageHeader title={active.label} description={active.description} />

		<div class="px-3 pb-4">
			<div class="d-lg-none mb-3 settings-measure">
				<label class="form-label" for="settings-section">Section</label>
				<Input type="select" id="settings-section" value={active.href} on:change={navigateTo}>
					{#each groups as group (group.id)}
						<optgroup label={group.label}>
							{#each group.sections as section (section.id)}
								<option value={section.href}>{section.label}</option>
							{/each}
						</optgroup>
					{/each}
				</Input>
			</div>

			<div class="settings-measure">
				{@render children()}
			</div>
		</div>
	</div>
</div>
