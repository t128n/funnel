<script lang="ts">
	/**
	 * The Issues list uses two-line rows with no column header. The Inbox still
	 * mounts this component above its virtualized issue rows, so it remains a
	 * quiet 1px rule rather than a set of column labels.
	 */
	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();
</script>

<div class="issue-list-header flex-shrink-0 {className}" aria-hidden="true"></div>

<style>
	.issue-list-header {
		height: 1px;
		background: var(--bs-border-color);
	}
</style>
