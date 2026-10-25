<script lang="ts">
	import { page } from '$app/state';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { settingsGroups } from '#lib/components/settings/sections';
	import { hasRole } from '#lib/roles';
	import type { LayoutProps } from './$types';

	/**
	 * Settings shell: a Bugzilla-style section bar above the active section.
	 *
	 * The bar is plain text links separated by pipes with a 1px `--border`
	 * bottom edge; the active section is 600 weight in `--primary` with a 2px
	 * bottom rule. Sections the viewer's role cannot open (workspace/system
	 * need `admin`) are filtered out; the server layout enforces the same rule
	 * for direct URLs.
	 */
	let { data, children }: LayoutProps = $props();

	const sections = $derived(
		settingsGroups
			.flatMap((group) => group.sections)
			.filter((section) => hasRole(data.user.role, section.minRole))
	);

	const active = $derived(
		sections.find((section) => page.url.pathname === section.href) ?? sections[0]
	);
</script>

<PageHead title={`${active.label} · Settings`} />

<div class="flex h-full min-h-0 min-w-0 flex-1 flex-col">
	<nav
		class="bug-chrome flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-1.5 text-xs"
		aria-label="Settings"
	>
		<span class="font-semibold">Settings</span>
		{#each sections as section (section.id)}
			<span class="text-muted-foreground" aria-hidden="true">|</span>
			<a
				href={section.href}
				aria-current={active.id === section.id ? 'page' : undefined}
				class="inline-block border-b-2 py-0.5 leading-5 no-underline {active.id === section.id
					? 'border-[color:var(--primary)] font-semibold text-[color:var(--primary)]'
					: 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				{section.label}
			</a>
		{/each}
	</nav>

	<div class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
		{@render children()}
	</div>
</div>
