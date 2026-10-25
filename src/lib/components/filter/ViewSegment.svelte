<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	/**
	 * All / Mine scope switch for the Issues view, rendered as pipe-separated
	 * text links (Bugzilla chrome carries no bordered segments).
	 *
	 * "Mine" is not a separate route — it maps onto the `assignee=me` filter the
	 * server already resolves to the signed-in viewer (SPEC §9.2). This control
	 * owns that scope exclusively: the Assignee multi-select lists only *other*
	 * people, so "assigned to me" has a single affordance.
	 */
	const assignees = $derived(page.url.searchParams.getAll('assignee'));
	const mineActive = $derived(assignees.length === 1 && assignees[0] === 'me');

	/** Preserve every other param (the filter dimensions) while setting
	 *  or clearing the single `assignee=me` dimension. */
	function href(mine: boolean): string {
		const params = new URLSearchParams();
		page.url.searchParams.forEach((value, key) => params.append(key, value));
		params.delete('assignee');
		if (mine) params.append('assignee', 'me');
		const query = params.toString();
		return query ? `${page.url.pathname}?${query}` : page.url.pathname;
	}

	interface SegmentItem {
		label: string;
		href: string;
		active: boolean;
	}

	const items = $derived<SegmentItem[]>([
		{ label: 'All', href: href(false), active: !mineActive },
		{ label: 'Mine', href: href(true), active: mineActive }
	]);

	/** Let modified clicks open a new tab; otherwise navigate without a reset. */
	function select(event: MouseEvent, item: SegmentItem) {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return;
		}
		event.preventDefault();
		if (!item.active) void goto(item.href, { reset: false });
	}
</script>

<nav class="flex items-center gap-1.5 text-sm" aria-label="Issue view">
	{#each items as item, index (item.label)}
		{#if index > 0}
			<span class="text-muted-foreground" aria-hidden="true">|</span>
		{/if}
		<a
			href={item.href}
			class={item.active ? 'link font-semibold' : 'text-muted-foreground hover:underline'}
			aria-current={item.active ? 'page' : undefined}
			onclick={(event) => select(event, item)}
		>
			{item.label}
		</a>
	{/each}
</nav>
