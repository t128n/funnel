<script lang="ts">
	import { cn } from '#lib/utils';

	/**
	 * The Issues list uses two-line rows with no column header. The Inbox still
	 * mounts this component above its virtualized issue rows, so it remains a
	 * quiet 1px rule rather than a set of column labels.
	 */
	interface Props {
		class?: string;
	}

	let { class: className }: Props = $props();
</script>

<div
	class={cn('h-px shrink-0 bg-border-subtle', className)}
	aria-hidden="true"
></div>
