<script lang="ts">
	import { page } from '$app/state';

	/**
	 * All / Mine segmented control for the Issues view.
	 *
	 * "Mine" is not a separate route — it maps onto the `assignee=me` filter the
	 * server already resolves to the signed-in viewer (SPEC §9.2, §9.4). The
	 * control therefore shares a URL key with the Assignee multi-select and reads
	 * as active only when that dimension is exactly `me`.
	 */
	const assignees = $derived(page.url.searchParams.getAll('assignee'));
	const mineActive = $derived(assignees.length === 1 && assignees[0] === 'me');

	/** Preserve every other param (filters, inspector selection) while setting
	 *  or clearing the single `assignee=me` dimension. */
	function href(mine: boolean): string {
		const params = new URLSearchParams();
		page.url.searchParams.forEach((value, key) => params.append(key, value));
		params.delete('assignee');
		if (mine) params.append('assignee', 'me');
		const query = params.toString();
		return query ? `${page.url.pathname}?${query}` : page.url.pathname;
	}
</script>

<div class="segment" role="group" aria-label="Issue view">
	<a
		class="segment__item"
		class:segment__item--active={!mineActive}
		href={href(false)}
		aria-current={!mineActive ? 'true' : undefined}
	>
		All
	</a>
	<a
		class="segment__item"
		class:segment__item--active={mineActive}
		href={href(true)}
		aria-current={mineActive ? 'true' : undefined}
	>
		Mine
	</a>
</div>

<style>
	.segment {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		height: 26px;
		padding: 2px;
		background: var(--color-surface-layer-1);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
	}

	.segment__item {
		display: inline-flex;
		align-items: center;
		height: 100%;
		padding: 0 var(--space-sm);
		border-radius: var(--radius-xs);
		color: var(--color-nav-text);
		font-size: var(--text-sm);
		text-decoration: none;
		transition:
			background var(--transition-fast),
			color var(--transition-fast);
	}

	.segment__item:hover {
		background: var(--color-nav-bg-hover);
		color: var(--color-nav-text-hover);
		text-decoration: none;
	}

	.segment__item--active {
		background: var(--color-nav-bg-active);
		color: var(--color-nav-text-active);
		font-weight: var(--weight-medium);
		box-shadow: inset 0 -2px 0 0 var(--color-primary);
	}
</style>
