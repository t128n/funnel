<script lang="ts">
	import IssueRow from '#lib/components/issue/IssueRow.svelte';
	import PriorityText from '#lib/components/common/PriorityText.svelte';
	import { matrixCellPriority } from '#lib/matrix';
	import {
		IMPACT_SCALE,
		URGENCY_SCALE,
		scaleLevel,
		type Impact,
		type Urgency
	} from '#lib/priority';
	import type { IssueListItem } from '#lib/server/issues/types';

	/**
	 * The selected cell's issue list. The header keeps the classification and
	 * derived priority in view even when the cell is empty, and rows open the
	 * dedicated issue page through the shared list row.
	 */
	interface Props {
		impact: Impact;
		urgency: Urgency;
		total: number;
		issues: IssueListItem[];
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
	}

	let { impact, urgency, total, issues, repoShortcodes = {} }: Props = $props();

	const impactName = $derived(scaleLevel(IMPACT_SCALE, impact)?.name ?? 'Unknown');
	const urgencyName = $derived(scaleLevel(URGENCY_SCALE, urgency)?.name ?? 'Unknown');
	const priority = $derived(matrixCellPriority(impact, urgency));
</script>

<header class="d-flex flex-column gap-1" aria-live="polite">
	<h2 id="matrix-detail-heading" tabindex="-1" class="fs-5 fw-semibold mb-0">
		{impactName} impact · {urgencyName} urgency
	</h2>
	<p class="d-flex flex-wrap align-items-center gap-2 small text-body-secondary mb-0">
		<PriorityText priority={priority.priority} showName />
		<span aria-hidden="true">·</span>
		<span class="tnum">{total} {total === 1 ? 'issue' : 'issues'}</span>
	</p>
</header>

<div class="mt-3 border-top">
	{#if issues.length === 0}
		<p class="py-4 text-body-secondary mb-0">No issues in this classification.</p>
	{:else}
		<ul
			class="list-unstyled mb-0"
			aria-label={`Issues with ${impactName} impact and ${urgencyName} urgency`}
		>
			{#each issues as issue (`${issue.repoId}:${issue.number}`)}
				<li>
					<IssueRow {issue} {repoShortcodes} />
				</li>
			{/each}
		</ul>
		{#if total > issues.length}
			<p class="small text-body-secondary border-top py-2 mb-0 tnum">
				Showing {issues.length} of {total} issues.
			</p>
		{/if}
	{/if}
</div>

<style>
	.tnum {
		font-variant-numeric: tabular-nums;
	}
</style>
