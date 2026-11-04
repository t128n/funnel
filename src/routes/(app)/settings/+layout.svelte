<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { Input, Nav, NavItem, NavLink } from '@sveltestrap/sveltestrap';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { settingsGroups } from '#lib/components/settings/sections';
	import { settingsDirty } from '#lib/components/settings/settings-dirty';
	import { hasRole } from '#lib/roles';
	import type { LayoutProps } from './$types';

	/**
	 * Settings page and its local navigation. Composition A has no global
	 * sidebar; the settings sections are a legitimate local page column inside
	 * a normal `container-xl` page. Above `lg` the nav is a grouped
	 * Bootstrap `nav-pills` column; below `lg` it becomes one labelled section
	 * switcher above the content. The h1 comes from the active section. The
	 * server layout still enforces admin-only sections for direct URLs, and the
	 * nav filters anything the viewer cannot open.
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

	/** The mobile switcher reads the same guard as every other link. */
	function navigateTo(event: Event): void {
		const target = event.currentTarget as HTMLSelectElement;
		const href = target.value;
		const current = page.url.pathname;
		if (href === current) return;
		// A cancelled navigation must leave this select on the current section.
		// Reset before `goto` (the confirm blocks inside it) and once more after
		// the dialog closes, in case the browser restored the clicked option.
		target.value = current;
		void goto(href);
		setTimeout(() => {
			if (page.url.pathname === current && target.isConnected) target.value = current;
		}, 0);
	}

	/** Ask before discarding an edited section, wherever the navigation starts. */
	beforeNavigate(({ cancel, to }) => {
		if (!get(settingsDirty) || !to) return;
		if (to.url.href === page.url.href) return;

		cancel();
		if (window.confirm('You have unsaved changes. Discard them and leave this section?')) {
			settingsDirty.set(false);
			void goto(to.url.href);
		}
	});

	// A reload, tab close, or link to another origin is not an in-app
	// `beforeNavigate`; the browser's own confirmation still protects the edit.
	onMount(() => {
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (!get(settingsDirty)) return;
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', beforeUnload);
		return () => window.removeEventListener('beforeunload', beforeUnload);
	});
</script>

<PageHead title={`${active.label} · Settings`} />

<main class="container-xl py-4">
	<PageHeader title={active.label} description={active.description}>
		{#snippet actions()}
			{#if $settingsDirty}
				<span class="badge text-bg-warning d-inline-flex align-items-center gap-1">
					<i class="bi bi-pencil-square" aria-hidden="true"></i>
					Unsaved changes
				</span>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="row g-4">
		<div class="col-lg-3">
			<div class="d-lg-none mb-3">
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

			<nav class="d-none d-lg-block" aria-label="Settings">
				{#each groups as group, index (group.id)}
					<div class="small fw-semibold text-body-secondary {index === 0 ? 'mb-1' : 'mt-3 mb-1'}">
						{group.label}
					</div>
					<Nav vertical pills>
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
		</div>

		<div class="col-lg-9">
			{@render children()}
		</div>
	</div>
</main>
