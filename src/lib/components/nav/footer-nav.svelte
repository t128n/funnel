<script lang="ts">
	/**
	 * Cockpit footer: the Bugzilla-style repeat of the primary destinations as
	 * pipe-separated text links, with the build version right-aligned.
	 */
	interface Props {
		version: string;
	}

	let { version }: Props = $props();

	const links = [
		{ href: '/', label: 'Home' },
		{ href: '/inbox', label: 'Inbox' },
		{ href: '/issues', label: 'Issues' },
		{ href: '/board', label: 'Board' },
		{ href: '/plan', label: 'Plan' },
		{ href: '/epics', label: 'Epics' },
		{ href: '/milestones', label: 'Milestones' },
		{ href: '/attention', label: 'Attention' }
	];
</script>

<footer
	class="bug-chrome-footer flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1 text-xs"
>
	<nav aria-label="Footer" class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
		{#each links as link, index (link.href)}
			{#if index > 0}
				<span class="text-muted-foreground" aria-hidden="true">|</span>
			{/if}
			<a class="link" href={link.href}>{link.label}</a>
		{/each}
	</nav>
	<span class="text-muted-foreground">Funnel {version}</span>
</footer>
