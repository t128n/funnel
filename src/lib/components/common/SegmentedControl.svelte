<script lang="ts">
	/**
	 * Presentational segmented control: a pill of mutually exclusive, link-based
	 * options. Callers own the URLs and the active flag, so it works for both the
	 * Issues `All`/`Mine` scope and its `Open`/`Closed`/`All` state switch.
	 */
	export interface SegmentItem {
		label: string;
		href: string;
		active: boolean;
	}

	interface Props {
		items: SegmentItem[];
		/** Accessible group name, e.g. "Issue view". */
		label: string;
	}

	let { items, label }: Props = $props();
</script>

<div class="segment" role="group" aria-label={label}>
	{#each items as item (item.label)}
		<a
			class="segment__item"
			class:segment__item--active={item.active}
			href={item.href}
			aria-current={item.active ? 'true' : undefined}
		>
			{item.label}
		</a>
	{/each}
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
		flex: none;
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
	}
</style>
