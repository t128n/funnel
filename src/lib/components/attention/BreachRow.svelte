<script lang="ts">
	import RefText from '#lib/components/common/RefText.svelte';
	import { ATTENTION_RULE_LABELS } from '#lib/attention';
	import { issuePath } from '#lib/issue-url';
	import { issueRef } from '#lib/issue-ref';
	import type { AttentionBreach } from '#lib/server/attention/rules';

	/**
	 * One rule breach on the Attention page. The group heading already names the
	 * rule, so the row leads with the issue reference and title, then shows the
	 * overdue count, summary and assignees. The whole row links to the issue.
	 */
	interface Props {
		breach: AttentionBreach;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
	}

	let { breach, repoShortcodes = {} }: Props = $props();

	const href = $derived(issuePath('issues', breach.repo, breach.number));
	const ref = $derived(issueRef(breach.repo, breach.number, repoShortcodes));
	const ruleLabel = $derived(ATTENTION_RULE_LABELS[breach.rule]);
	const assigneeText = $derived(
		breach.assignees.map((person) => person.login).join(', ')
	);
	const overdueLabel = $derived(
		breach.daysOverdue === 0
			? 'At threshold'
			: `${breach.daysOverdue}d overdue`
	);
</script>

<div
	role="listitem"
	class="breach-row position-relative d-flex align-items-center gap-3 border-bottom px-3 py-2"
>
	<a
		{href}
		class="breach-row__link"
		aria-label={`Open ${breach.repo}#${breach.number}: ${breach.title}`}
	></a>

	<div class="d-flex min-w-0 flex-grow-1 flex-column gap-1 py-1">
		<div class="d-flex min-w-0 flex-wrap align-items-center gap-2">
			<span class="d-inline-flex align-items-center gap-1 small text-nowrap flex-shrink-0 text-body-secondary">
				<i class="bi bi-exclamation-octagon" aria-hidden="true"></i>
				<span>{ruleLabel}</span>
			</span>

			<span
				class="flex-shrink-0 small tabular {breach.daysOverdue === 0
					? 'text-warning-emphasis'
					: 'text-danger'}"
			>
				{overdueLabel}
			</span>

			<span class="flex-shrink-0 link-primary">
				<RefText value={ref} title={`${breach.repo}#${breach.number}`} class="text-reset" />
			</span>

			<span class="min-w-0 flex-grow-1 text-truncate small text-body" title={breach.title}>
				{breach.title}
			</span>
		</div>

		<div class="d-flex min-w-0 align-items-center gap-2 small text-body-secondary">
			<span class="min-w-0 flex-grow-1 text-truncate" title={breach.summary}>
				{breach.summary}
			</span>
			<span class="flex-shrink-0 text-truncate" title={assigneeText}>
				{assigneeText || 'Unassigned'}
			</span>
		</div>
	</div>
</div>

<style>
	.breach-row__link {
		position: absolute;
		inset: 0;
		outline: none;
	}

	.breach-row__link:focus-visible {
		outline: 2px solid var(--bs-primary);
		outline-offset: -2px;
	}

	.tabular {
		font-variant-numeric: tabular-nums;
	}
</style>
