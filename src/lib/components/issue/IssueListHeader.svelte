<script lang="ts">
	import { cn } from '#lib/utils';

	/**
	 * Column markers for the issue list. Shares the row grid from `IssueRow`
	 * (`5.5rem · title · 7rem · 4.5rem · 3rem · 5rem · 7rem`) and collapses to
	 * `Ref · Title` whenever the list column is narrow. Caption-size, sentence
	 * case, 600 weight on `surface-2`; no uppercase, no letter spacing.
	 */
	interface Props {
		class?: string;
	}

	let { class: className }: Props = $props();
</script>

<div class={cn('issue-columns', className)} aria-hidden="true">
	<span class="issue-head-ref">Ref</span>
	<span class="issue-head-title">Title</span>
	<span class="issue-head-meta">Status</span>
	<span class="issue-head-meta">Priority</span>
	<span class="issue-head-meta">Size</span>
	<span class="issue-head-meta justify-self-end">Updated</span>
	<span class="issue-head-meta justify-self-end">Assignee</span>
</div>

<style>
	.issue-columns {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		flex: none;
		height: var(--size-row-compact);
		border-bottom: 1px solid var(--color-border-subtle);
		background: var(--color-surface-2);
		color: var(--color-text-secondary);
		font-size: var(--font-size-caption);
		font-weight: var(--font-weight-semibold);
		white-space: nowrap;
	}

	.issue-columns > span {
		min-width: 0;
		padding-inline: var(--space-3);
	}

	.issue-head-meta {
		display: none;
	}

	@container (min-width: 48rem) {
		.issue-columns {
			grid-template-columns: 5.5rem minmax(0, 1fr) 7rem 4.5rem 3rem 5rem 7rem;
		}

		.issue-head-meta {
			display: block;
		}
	}
</style>
