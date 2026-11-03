<script lang="ts">
	/** Collapsible section header for grouped issue lists (`In progress · 4`). */
	interface Props {
		label: string;
		count: number;
		collapsed: boolean;
		ontoggle: () => void;
	}

	let { label, count, collapsed, ontoggle }: Props = $props();
</script>

<button
	type="button"
	class="issue-group-header d-flex w-100 align-items-center gap-2 px-3 text-start small fw-medium text-body-secondary"
	aria-expanded={!collapsed}
	onclick={ontoggle}
>
	<span class="text-truncate">{label}</span>
	<span class="issue-group-count text-body-tertiary">{count}</span>
	<i
		class="bi {collapsed ? 'bi-chevron-right' : 'bi-chevron-down'} ms-auto flex-shrink-0"
		aria-hidden="true"
	></i>
</button>

<style>
	.issue-group-header {
		height: 2rem;
		border: 0;
		border-bottom: 1px solid var(--bs-border-color-translucent);
		background: var(--bs-body-bg);
		cursor: pointer;
	}

	.issue-group-count {
		font-variant-numeric: tabular-nums;
	}

	@media (hover: hover) and (pointer: fine) {
		.issue-group-header:hover {
			background: var(--bs-tertiary-bg);
		}
	}
</style>
