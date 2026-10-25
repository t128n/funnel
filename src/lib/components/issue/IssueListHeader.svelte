<script lang="ts">
	import { cn } from '#lib/utils';

	/**
	 * Sticky column markers for the issue list, styled as a Bugzilla result-table
	 * head: an 11px uppercase, letter-spaced label bar on `--muted` with a real
	 * 1px bottom rule. Shares `.issue-grid` with every row so the slots stay
	 * aligned; the metadata labels only appear once the list is wide enough to
	 * give them room (see `global.css`).
	 */
	interface Props {
		class?: string;
	}

	let { class: className }: Props = $props();

	const label = 'text-xs font-semibold tracking-[0.04em] uppercase';
</script>

<div
	class={cn(
		'issue-grid sticky top-0 z-10 border-b border-border bg-muted px-2 py-1',
		className
	)}
	aria-hidden="true"
>
	<span></span>
	<span></span>
	<span class={label}>Title</span>
	<span class={cn('issue-col-labels', label)}>Labels</span>
	<span class={cn('issue-head-meta', label)}>Priority</span>
	<span class={cn('issue-head-meta', label)}>Size</span>
	<span class={cn('issue-head-meta justify-self-end', label)}>Updated</span>
	<span class={cn('issue-head-meta justify-self-end', label)}>Assignee</span>
</div>
