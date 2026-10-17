<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { DropdownMenu } from 'bits-ui';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import { signOut } from '#lib/client/auth';
	import { setTheme, themeChoice, type ThemeChoice } from '#lib/client/theme';
	import IconFunnel from '~icons/carbon/funnel-sequence';
	import IconChevronDown from '~icons/carbon/chevron-down';
	import IconSearch from '~icons/carbon/search';
	import IconAdd from '~icons/carbon/add';
	import IconInbox from '~icons/carbon/box';
	import IconIssues from '~icons/carbon/center-square';
	import IconBoard from '~icons/carbon/split-screen';
	import IconLogout from '~icons/carbon/logout';
	import IconSource from '~icons/carbon/logo-github';
	import IconPalette from '~icons/carbon/color-palette';

	interface Props {
		user: { id: string; name: string; email: string; image: string | null };
	}

	let { user }: Props = $props();

	const SOURCE_URL = 'https://github.com/t128n/funnel';

	// Flat information architecture: three sibling views. "My Issues" is no
	// longer a root link — it lives as a segmented filter on the Issues view
	// (`/issues?assignee=me`). See docs/SPEC.md §9.2.
	const views = [
		{ href: '/inbox', label: 'Inbox', Icon: IconInbox },
		{ href: '/issues', label: 'Issues', Icon: IconIssues },
		{ href: '/board', label: 'Board', Icon: IconBoard }
	];

	const themeOptions: { value: ThemeChoice; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'light', label: 'Light' }
	];

	/** Label of the active theme, shown on the footer trigger. */
	const currentThemeLabel = $derived(
		themeOptions.find((option) => option.value === $themeChoice)?.label ?? 'System'
	);

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}

	async function handleSignOut() {
		await signOut();
		await goto('/login');
	}

	/** Focus the view's filter-bar search, navigating to Issues if needed. */
	async function focusSearch() {
		let input = document.getElementById('issue-search');
		if (!input) {
			await goto('/issues');
			await tick();
			input = document.getElementById('issue-search');
		}
		input?.focus();
	}

	function openNew() {
		void goto('/submit');
	}

	/** Global shortcuts: ⌘/Ctrl+K search, bare `C` quick-create. */
	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void focusSearch();
			return;
		}

		const target = event.target;
		const typing =
			target instanceof HTMLElement &&
			(target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'SELECT' ||
				target.isContentEditable);

		if (
			!typing &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			(event.key === 'c' || event.key === 'C')
		) {
			event.preventDefault();
			openNew();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<aside class="sidebar">
	<header class="side-head">
		<div class="instance">
			<span class="instance__mark">
				<IconFunnel width={16} height={16} />
			</span>
			<span class="instance__name">Funnel</span>
		</div>

		<div class="side-head__actions">
			<button
				class="icon-btn"
				type="button"
				title="Source · AGPL-3.0"
				aria-label="Source on GitHub"
				onclick={() => window.open(SOURCE_URL, '_blank', 'noopener,noreferrer')}
			>
				<IconSource width={16} height={16} />
			</button>
			<button
				class="icon-btn icon-btn--create"
				type="button"
				title="New issue (C)"
				aria-label="New issue"
				onclick={openNew}
			>
				<IconAdd width={16} height={16} />
			</button>
		</div>
	</header>

	<nav class="nav" aria-label="Views">
		{#each views as view (view.href)}
			{@const Icon = view.Icon}
			<a
				class="nav__item"
				class:nav__item--active={isActive(view.href)}
				href={view.href}
				title={view.label}
				aria-label={view.label}
				aria-current={isActive(view.href) ? 'page' : undefined}
			>
				<span class="nav__glyph"><Icon width={16} height={16} /></span>
				<span class="nav__label">{view.label}</span>
			</a>
		{/each}
	</nav>

	<div class="theme-bar">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger class="theme-trigger" aria-label="Theme">
				<span class="theme-trigger__glyph">
					<IconPalette width={16} height={16} />
				</span>
				<span class="theme-trigger__label">Theme</span>
				<span class="theme-trigger__value">{currentThemeLabel}</span>
				<span class="theme-trigger__caret">
					<IconChevronDown width={14} height={14} />
				</span>
			</DropdownMenu.Trigger>

			<DropdownMenu.Portal>
				<DropdownMenu.Content side="top" align="start" sideOffset={6} class="side-menu">
					<DropdownMenu.RadioGroup
						aria-label="Theme"
						value={$themeChoice}
						onValueChange={(value) => setTheme(value as ThemeChoice)}
					>
						{#each themeOptions as option (option.value)}
							<DropdownMenu.RadioItem value={option.value} class="side-menu__item">
								<span>{option.label}</span>
								<span class="side-menu__check" aria-hidden="true">
									{#if $themeChoice === option.value}✓{/if}
								</span>
							</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	</div>

	<div class="footer">
		<div class="profile" title={user.email}>
			<Avatar login={user.name} avatarUrl={user.image} size={24} />
			<div class="profile__meta">
				<span class="profile__name">{user.name}</span>
			</div>
			<button class="profile__out" type="button" title="Sign out" onclick={handleSignOut}>
				<IconLogout width={15} height={15} />
			</button>
		</div>
	</div>
</aside>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		width: var(--sidebar-width);
		flex: none;
		height: 100%;
		background: var(--color-surface-layer-1);
		border-right: 1px solid var(--color-border-subtle);
	}

	/* Header: workspace/instance menu + primary actions. */
	.side-head {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		height: var(--topbar-height);
		padding: 0 var(--space-sm);
		border-bottom: 1px solid var(--color-border-subtle);
		flex: none;
	}

	.instance {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex: 1;
		min-width: 0;
		height: 32px;
		padding: var(--space-xs) var(--space-sm);
		margin-left: calc(var(--space-xs) * -1);
	}

	.instance__mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex: none;
		color: var(--color-nav-title);
	}

	.instance__name {
		min-width: 0;
		font-size: var(--text-md);
		font-weight: var(--weight-medium);
		letter-spacing: -0.01em;
		color: var(--color-nav-title);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.side-head__actions {
		display: flex;
		align-items: center;
		gap: 2px;
		flex: none;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--color-nav-text);
		cursor: pointer;
		transition:
			background var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.icon-btn:hover {
		background: var(--color-btn-ghost-hover);
		color: var(--color-text-primary);
	}

	/* Create action: boxed ghost button, matching an edit/compose affordance. */
	.icon-btn--create {
		border-color: var(--color-btn-border);
	}

	.icon-btn--create:hover {
		border-color: var(--color-border-strong);
	}

	/* Flat navigation: dense sibling rows, no category headings. */
	.nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-md) var(--space-sm);
		flex: 1;
		overflow-y: auto;
	}

	.nav__item {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 30px;
		padding: 0 var(--space-sm);
		border-radius: var(--radius-sm);
		color: var(--color-nav-text);
		font-size: var(--text-base);
		letter-spacing: -0.01em;
		text-decoration: none;
		transition:
			background var(--transition-fast),
			color var(--transition-fast);
	}

	.nav__item:hover {
		background: var(--color-nav-bg-hover);
		color: var(--color-nav-text-hover);
		text-decoration: none;
	}

	.nav__item:hover .nav__glyph {
		color: var(--color-nav-icon-hover);
	}

	/* Subtle, neutral fill — no asymmetric accent border (docs/DESIGN.md). */
	.nav__item--active {
		background: var(--color-nav-bg-active);
		color: var(--color-nav-text-active);
		font-weight: var(--weight-medium);
	}

	.nav__item--active .nav__glyph {
		color: var(--color-nav-icon-active);
	}

	.nav__glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex: none;
		color: var(--color-nav-icon);
		transition: color var(--transition-fast);
	}

	.nav__label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Theme selector: sits above the footer separator, with breathing room. */
	.theme-bar {
		padding: var(--space-xs) var(--space-sm) var(--space-sm);
		flex: none;
	}

	/* Footer: account only, set off by the separator above it. */
	.footer {
		padding: var(--space-sm);
		border-top: 1px solid var(--color-border-subtle);
		flex: none;
	}

	/* Ghost row; its menu opens upward from the bottom of the sidebar. */
	:global(.theme-trigger) {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		width: 100%;
		height: 28px;
		padding: var(--space-xs) var(--space-sm);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--color-nav-text);
		font-size: var(--text-sm);
		cursor: pointer;
		text-align: left;
		transition:
			background var(--transition-fast),
			color var(--transition-fast);
	}

	:global(.theme-trigger:hover) {
		background: var(--color-nav-bg-hover);
		color: var(--color-nav-text-hover);
	}

	.theme-trigger__glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex: none;
		color: var(--color-nav-icon);
	}

	.theme-trigger__label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.theme-trigger__value {
		flex: none;
		color: var(--color-text-muted);
	}

	.theme-trigger__caret {
		display: inline-flex;
		flex: none;
		color: var(--color-nav-caret);
	}

	.profile {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs);
		border-radius: var(--radius-sm);
	}

	.profile__meta {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		flex: 1;
		line-height: 1.2;
	}

	.profile__name {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--color-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.profile__out {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			background var(--transition-fast),
			color var(--transition-fast);
	}

	.profile__out:hover {
		color: var(--color-accent-red);
		background: var(--color-surface-layer-2);
	}

	/* Portaled menu surface (Acrylic, docs/DESIGN.md §Elevation). */
	:global(.side-menu) {
		z-index: 60;
		min-width: 200px;
		padding: var(--space-xs);
		background: var(--color-surface-overlay-translucent);
		backdrop-filter: blur(var(--backdrop-blur));
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-overlay);
	}

	:global(.side-menu__item) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-xs);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		outline: none;
	}

	:global(.side-menu__item:hover),
	:global(.side-menu__item[data-highlighted]) {
		background: var(--color-surface-layer-2);
		color: var(--color-text-primary);
	}

	:global(.side-menu__check) {
		color: var(--color-primary);
		font-family: var(--font-mono);
	}
</style>
