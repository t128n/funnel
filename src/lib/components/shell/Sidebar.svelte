<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import ThemeSwitcher from './ThemeSwitcher.svelte';
	import { signOut } from '#lib/client/auth';

	interface Props {
		user: { id: string; name: string; email: string; image: string | null };
	}

	let { user }: Props = $props();

	const SOURCE_URL = 'https://github.com/t128n/funnel';

	const nav = [
		{ href: '/inbox', label: 'Inbox', icon: 'M2 3h12v10H2zM2 7h3l1 2h4l1-2h3' },
		{ href: '/issues', label: 'All Issues', icon: 'M3 4h10M3 8h10M3 12h6' },
		{
			href: '/my',
			label: 'My Issues',
			icon: 'M8 8a3 3 0 100-6 3 3 0 000 6zM2.5 14a5.5 5.5 0 0111 0'
		},
		{ href: '/board', label: 'Status Board', icon: 'M2 3h3v10H2zM6.5 3h3v10h-3zM11 3h3v10h-3z' }
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}

	async function handleSignOut() {
		await signOut();
		await goto('/login');
	}
</script>

<aside class="sidebar">
	<div class="brand">
		<span class="brand__mark">F</span>
		<div class="brand__text">
			<span class="brand__name">Funnel</span>
			<span class="brand__tag">triage cockpit</span>
		</div>
	</div>

	<nav class="nav" aria-label="Views">
		{#each nav as item (item.href)}
			<a
				class="nav__item"
				class:nav__item--active={isActive(item.href)}
				href={item.href}
				aria-current={isActive(item.href) ? 'page' : undefined}
			>
				<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
					<path
						d={item.icon}
						fill="none"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span>{item.label}</span>
			</a>
		{/each}
	</nav>

	<div class="footer">
		<ThemeSwitcher />

		<a class="footer__link" href={SOURCE_URL} target="_blank" rel="noreferrer">
			<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
				<path
					fill="currentColor"
					d="M8 0a8 8 0 00-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-1-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.5 7.5 0 014 0c1.5-1 2.2-.8 2.2-.8.5 1.1.2 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3-1.8 3.7-3.6 3.9.3.3.5.8.5 1.6v2.3c0 .2.1.5.5.4A8 8 0 008 0z"
				/>
			</svg>
			<span>AGPL-3.0 · Source</span>
		</a>

		<div class="profile">
			<Avatar login={user.name} avatarUrl={user.image} size={24} />
			<div class="profile__meta">
				<span class="profile__name">{user.name}</span>
				<span class="profile__email">{user.email}</span>
			</div>
			<button class="profile__out" type="button" title="Sign out" onclick={handleSignOut}>
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
					<path
						d="M6 2H3v12h3M10 11l3-3-3-3M13 8H6"
						fill="none"
						stroke="currentColor"
						stroke-width="1.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
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

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		height: var(--topbar-height);
		padding: 0 var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.brand__mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-on-primary);
		font-weight: var(--weight-semibold);
	}

	.brand__text {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}

	.brand__name {
		font-weight: var(--weight-semibold);
		font-size: var(--text-md);
	}

	.brand__tag {
		font-size: 10px;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-sm);
		flex: 1;
	}

	.nav__item {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		height: 32px;
		padding: 0 var(--space-sm);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: var(--text-base);
		text-decoration: none;
	}

	.nav__item:hover {
		background: var(--color-surface-layer-2);
		color: var(--color-text-primary);
		text-decoration: none;
	}

	.nav__item--active {
		background: color-mix(in srgb, var(--color-primary) 16%, transparent);
		color: var(--color-text-primary);
		box-shadow: inset 2px 0 0 var(--color-primary);
	}

	.footer {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		padding: var(--space-sm);
		border-top: 1px solid var(--color-border-subtle);
	}

	.footer__link {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		text-decoration: none;
	}

	.footer__link:hover {
		color: var(--color-text-secondary);
		background: var(--color-surface-layer-2);
		text-decoration: none;
	}

	.profile {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-sm);
		border-top: 1px solid var(--color-border-subtle);
		margin-top: var(--space-xs);
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
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.profile__email {
		font-size: 10px;
		color: var(--color-text-muted);
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
	}

	.profile__out:hover {
		color: var(--color-accent-red);
		background: var(--color-surface-layer-2);
	}
</style>
