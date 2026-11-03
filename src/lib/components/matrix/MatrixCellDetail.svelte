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
	 * derived priority in view even when the cell is empty, and rows reuse the
	 * shared issue presentation so opening one docks the standard Inspector.
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

<header class="flex flex-col gap-1" aria-live="polite">
	<h2
		id="matrix-detail-heading"
		tabindex="-1"
		class="text-heading-sm font-semibold leading-heading-sm text-fg"
	>
		{impactName} impact · {urgencyName} urgency
	</h2>
	<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-secondary">
		<PriorityText priority={priority.priority} showName />
		<span aria-hidden="true">·</span>
		<span class="tabular-nums">{total} {total === 1 ? 'issue' : 'issues'}</span>
	</p>
</header>

<div class="mt-[var(--space-block)] border-t border-border-subtle">
	{#if issues.length === 0}
		<p class="py-6 text-body text-fg-secondary">No issues in this classification.</p>
	{:else}
		<ul
			class="m-0 list-none p-0"
			aria-label={`Issues with ${impactName} impact and ${urgencyName} urgency`}
		>
			{#each issues as issue (`${issue.repoId}:${issue.number}`)}
				<li>
					<IssueRow {issue} {repoShortcodes} />
				</li>
			{/each}
		</ul>
		{#if total > issues.length}
			<p class="border-t border-border-subtle py-2 text-caption tabular-nums text-fg-secondary">
				Showing {issues.length} of {total} issues.
			</p>
		{/if}
	{/if}
</div>
