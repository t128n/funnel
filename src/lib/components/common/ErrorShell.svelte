<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle } from '@sveltestrap/sveltestrap';
	import {
		resolvedTheme,
		setTheme,
		themeChoice,
		type ThemeChoice
	} from '#lib/client/theme';
	import { PRIMARY_NAV } from '#lib/components/shell/navigation';

	/**
	 * Lightweight Composition A shell for the root error page. The authenticated
	 * `(app)` shell needs layout data that is unavailable when the root route
	 * fails, but an error should still keep a brand, the primary destinations,
	 * the theme control and a skip link. The full navbar is intentionally not
	 * duplicated: this is a single conventional bar, not a second navigation
	 * system.
	 */
	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	const themes: { value: ThemeChoice; label: string; icon: string }[] = [
		{ value: 'system', label: 'System', icon: 'bi-circle-half' },
		{ value: 'light', label: 'Light', icon: 'bi-sun' },
		{ value: 'dark', label: 'Dark', icon: 'bi-moon' }
	];

	const dark = $derived($resolvedTheme === 'dark');
</script>

<a
	class="visually-hidden-focusable position-absolute top-0 start-0 z-3 m-2 p-2 bg-body border rounded"
	href="#main">Skip to main content</a
>

<nav class="navbar navbar-dark bg-dark py-2" aria-label="Primary">
	<div class="container-fluid flex-wrap align-items-center gap-2">
		<a href="/issues" class="navbar-brand fw-semibold mb-0 me-2" translate="no">funnel</a>

		<ul class="navbar-nav flex-row flex-wrap gap-1 me-auto">
			{#each PRIMARY_NAV as destination (destination.href)}
				<li class="nav-item">
					<a class="nav-link px-2" href={destination.href}>{destination.label}</a>
				</li>
			{/each}
		</ul>

		<div class="ms-auto ms-lg-0">
			<Dropdown>
				<DropdownToggle
					color="link"
					size="sm"
					caret={false}
					class="nav-quiet text-decoration-none"
					aria-label="Theme"
					title="Theme"
				>
					<i class="bi {dark ? 'bi-moon' : 'bi-sun'}" aria-hidden="true"></i>
				</DropdownToggle>
				<DropdownMenu end>
					<DropdownItem header>Theme</DropdownItem>
					{#each themes as theme (theme.value)}
						<DropdownItem class="d-flex align-items-center gap-2" on:click={() => setTheme(theme.value)}>
							<i class="bi {theme.icon}" aria-hidden="true"></i>
							<span>{theme.label}</span>
							{#if $themeChoice === theme.value}
								<i class="bi bi-check2 ms-auto" aria-hidden="true"></i>
							{/if}
						</DropdownItem>
					{/each}
				</DropdownMenu>
			</Dropdown>
		</div>
	</div>
</nav>

<main id="main" tabindex="-1" class="container-lg py-4">
	{@render children()}
</main>
