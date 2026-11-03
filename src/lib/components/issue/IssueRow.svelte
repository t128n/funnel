<script module lang="ts">
	/**
	 * Closed issues read as resolved history: their title is struck through and
	 * their metadata drops to the muted colour. Pure so the row's one piece of
	 * visual-state logic can be tested without mounting the component.
	 */
	export function isStruckThrough(state: string): boolean {
		return state === 'closed';
	}
</script>

<script lang="ts">
	import PriorityText from '#lib/components/common/PriorityText.svelte';
	import RefText from '#lib/components/common/RefText.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import { weekHeadline } from '#lib/components/plan/format';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { issuePath } from '#lib/issue-url';
	import { issueRef } from '#lib/issue-ref';
	import { canonicalLabel } from '#lib/labels';
	import { isRetiredPriorityLabel } from '#lib/priority';
	import type { IssueListItem } from '#lib/server/issues/types';
	import type { GroupKey } from './grouping';

	/**
	 * One row of the issue stream shared by the Issues feed, the Inbox queue and
	 * the board's Backlog list.
	 *
	 * The row is a stable two-line list: a fixed reference slot and the title on
	 * the first line, then one metadata line aligned under the title. Metadata
	 * always reads status, priority, size, updated, assignee, milestone/labels;
	 * the trailing context truncates so it can never displace the fixed fields.
	 * Selection is the 2px primary leading bar, never a fill.
	 */
	interface Props {
		issue: IssueListItem;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
		/** When grouped by status the section header carries it, so the row omits its status. */
		groupedBy?: GroupKey | null;
		/** Retained for the Inbox caller; rows no longer alternate their fill. */
		index?: number;
	}

	let {
		issue,
		repoShortcodes = {},
		groupedBy = null
	}: Props = $props();

	const ref = $derived(issueRef(issue.repo, issue.number, repoShortcodes));
	const closed = $derived(isStruckThrough(issue.state));
	const title = $derived(issue.title.trim() || 'Untitled');
	const untitled = $derived(issue.title.trim().length === 0);

	/** Non-reserved labels only; reserved groups render as dedicated fields. */
	const labels = $derived(
		issue.labels.filter(
			(label) => !canonicalLabel(label) && !isRetiredPriorityLabel(label)
		)
	);

	const milestoneText = $derived(
		issue.milestone
			? issue.milestone.title || `${issue.milestone.repo}#${issue.milestone.number}`
			: null
	);
	const contextText = $derived(
		[milestoneText, ...labels]
			.filter((value): value is string => Boolean(value))
			.join(', ')
	);

	const sizeText = $derived(
		issue.size === 'sm' ? 'S' : issue.size === 'md' ? 'M' : issue.size === 'lg' ? 'L' : null
	);

	const assigneeText = $derived(issue.assignees.map((person) => person.login).join(', '));

	const planText = $derived(
		issue.planWeek
			? weekHeadline(issue.planWeek).replace('Week of ', '')
			: null
	);

	const showStatus = $derived(groupedBy !== 'status');

	function select() {
		selectIssue(issue.repo, issue.number);
	}
</script>

<div
	class="issue-row {closed ? 'text-body-tertiary' : 'text-body'}"
	role="button"
	tabindex={0}
	aria-label={`${ref}: ${title}`}
	onclick={select}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			select();
		}
	}}
>
	<span class="issue-ref" title={`${issue.repo}#${issue.number}`}>
		<a
			href={issuePath('issues', issue.repo, issue.number)}
			class="issue-ref-link link-primary text-decoration-none"
			onclick={(event) => event.stopPropagation()}
		>
			<RefText value={ref} class="text-reset" />
		</a>
	</span>

	<span class="issue-title">
		<span
			class="issue-title-text min-w-0 text-break {closed || untitled
				? 'text-body-tertiary'
				: 'text-body'} {untitled ? 'is-untitled' : ''} {closed ? 'is-closed' : ''}"
			title={title}
		>
			{title}
		</span>
		{#if issue.labelConflict}
			<i
				class="bi bi-exclamation-triangle flex-shrink-0 text-warning"
				title="Conflicting reserved label or retired priority label on GitHub"
				role="img"
				aria-label="Conflicting reserved label or retired priority label on GitHub"
			></i>
		{/if}
	</span>

	<span class="issue-meta">
		{#if showStatus}
			<span class="issue-status">
				<StatusText
					status={issue.status}
					state={issue.state}
					blocked={issue.blocked}
					class={closed ? 'text-body-tertiary' : undefined}
				/>
			</span>
		{/if}

		{#if issue.priority}
			<span class="issue-priority">
				<PriorityText
					priority={issue.priority}
					class={closed ? 'text-body-tertiary' : undefined}
				/>
			</span>
		{/if}

		{#if sizeText}
			<span class="issue-size" title={`Size: ${issue.size}`}>{sizeText}</span>
		{/if}

		{#if planText}
			<span
				class="issue-plan text-primary"
				title={`Planned for ${weekHeadline(issue.planWeek ?? '')}`}
			>
				<i class="bi bi-calendar-check me-1" aria-hidden="true"></i>Planned {planText}
			</span>
		{/if}

		<span
			class="issue-updated"
			title={new Date(issue.updatedAt).toLocaleString()}
		>
			{timeAgo(issue.updatedAt)}
		</span>

		<span class="issue-assignee" title={assigneeText || 'Unassigned'}>
			{#if assigneeText}
				{assigneeText}
			{:else}
				<span class="text-body-tertiary">Unassigned</span>
			{/if}
		</span>

		{#if contextText}
			<span class="issue-context" title={contextText}>{contextText}</span>
		{/if}
	</span>
</div>

<style>
	.issue-row {
		/* 5.5rem: a stable column wide enough for `FIT-1234` without letting a
		   long reference shift every title. */
		--issue-ref-column: 5.5rem;
		display: grid;
		grid-template-columns: var(--issue-ref-column) minmax(0, 1fr);
		grid-template-areas:
			'ref title'
			'. meta';
		align-items: baseline;
		min-height: 2.5rem;
		column-gap: 0.75rem;
		row-gap: 0.125rem;
		padding: 0.2rem 0.75rem;
		border-bottom: 1px solid var(--bs-border-color-translucent);
		cursor: pointer;
		user-select: none;
	}

	.issue-row:focus-visible {
		outline: 2px solid var(--bs-primary);
		outline-offset: -2px;
	}

		.issue-ref-link:hover {
		text-decoration: underline !important;
	}

	.issue-row > .issue-ref {
		grid-area: ref;
		min-width: 0;
		overflow: hidden;
		font-size: 0.75rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.issue-row > .issue-title {
		grid-area: title;
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.25rem;
	}

	.issue-title-text {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		font-size: 0.875rem;
		line-height: 1.35;
	}

	.issue-title-text.is-untitled {
		font-style: italic;
	}

	.issue-title-text.is-closed {
		text-decoration: line-through;
	}

	.issue-meta {
		grid-area: meta;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.75rem;
		min-width: 0;
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--bs-secondary-color);
	}

	.issue-meta > * {
		flex: none;
		min-width: 0;
	}

	.issue-updated {
		font-variant-numeric: tabular-nums;
	}

	.issue-plan {
		white-space: nowrap;
	}

	.issue-assignee {
		max-width: 10rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.issue-context {
		flex: 1 1 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (hover: hover) and (pointer: fine) {
		.issue-row:hover {
			background: var(--bs-tertiary-bg);
		}
	}
</style>
