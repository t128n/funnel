<script lang="ts">
	import {
		pullRequestSummaryIcon,
		pullRequestSummaryLabel
	} from '#lib/components/issue/pull-request-format';
	import type { IssuePullRequestSummary } from '#lib/server/issues/types';

	/**
	 * Compact development indicator shared by stream rows, table rows and board
	 * cards. It is deliberately icon-first: the full label stays in `title` and
	 * `aria-label`, so the dense feed keeps its column width.
	 */
	interface Props {
		summary?: IssuePullRequestSummary;
	}

	let { summary }: Props = $props();

	const label = $derived(summary ? pullRequestSummaryLabel(summary) : '');
	const icon = $derived(summary ? pullRequestSummaryIcon(summary) : '');
</script>

{#if summary}
	<span
		class="pull-request-indicator d-inline-flex flex-shrink-0 align-items-center gap-1"
		role="img"
		title={label}
		aria-label={label}
	>
		<i class="bi {icon}" aria-hidden="true"></i>
		<span class="font-monospace">{summary.total}</span>
		{#if summary.checksFailed > 0}
			<span class="text-danger font-monospace">{summary.checksFailed}</span>
		{/if}
	</span>
{/if}

<style>
	.pull-request-indicator {
		font-size: 0.75rem;
		line-height: 1;
	}
</style>
