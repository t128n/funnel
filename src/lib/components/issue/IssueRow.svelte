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
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import PriorityText from '#lib/components/common/PriorityText.svelte';
	import RefText from '#lib/components/common/RefText.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { issueRef } from '#lib/issue-ref';
	import { canonicalLabel } from '#lib/labels';
	import { isRetiredPriorityLabel } from '#lib/priority';
	import type { IssueListItem } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
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
		selected?: boolean;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
		/** When grouped by status the section header carries it, so the row omits its status. */
		groupedBy?: GroupKey | null;
		/** Retained for the Inbox caller; rows no longer alternate their fill. */
		index?: number;
	}

	let {
		issue,
		selected = false,
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

	const showStatus = $derived(groupedBy !== 'status');

	function select() {
		selectIssue(issue.repo, issue.number);
	}
</script>

<div
	class={cn(
		'issue-row group/row cursor-pointer select-none border-b border-border-subtle',
		'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
		closed ? 'text-fg-muted' : 'text-fg',
		selected && 'is-selected-row'
	)}
	role="button"
	tabindex={0}
	aria-current={selected ? 'true' : undefined}
	aria-label={`${ref}: ${title}`}
	onclick={select}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			select();
		}
	}}
>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class="issue-ref">
					<RefText value={ref} class="text-caption" />
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{issue.repo}#{issue.number}</Tooltip.Content>
	</Tooltip.Root>

	<span class="issue-title">
		<span
			class={cn(
				'line-clamp-2 min-w-0 break-words text-body',
				closed || untitled ? 'text-fg-muted' : 'text-fg',
				untitled && 'italic',
				closed && 'line-through'
			)}
			title={title}
		>
			{title}
		</span>
		{#if issue.labelConflict}
			<TriangleAlertIcon
				class="size-3.5 shrink-0 text-warning"
				title="Conflicting reserved label or retired priority label on GitHub"
			/>
		{/if}
	</span>

	<span class="issue-meta">
		{#if showStatus}
			<span class="issue-status">
				<StatusText
					status={issue.status}
					state={issue.state}
					blocked={issue.blocked}
					class={closed ? 'text-fg-muted' : undefined}
				/>
			</span>
		{/if}

		{#if issue.priority}
			<span class="issue-priority">
				<PriorityText
					priority={issue.priority}
					class={closed ? 'text-fg-muted' : undefined}
				/>
			</span>
		{/if}

		{#if sizeText}
			<span class="issue-size" title={`Size: ${issue.size}`}>{sizeText}</span>
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
				<span class="text-fg-muted">Unassigned</span>
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
		--issue-ref-column: calc(var(--space-7) + var(--space-6) + var(--space-2));
		display: grid;
		grid-template-columns: var(--issue-ref-column) minmax(0, 1fr);
		grid-template-areas:
			'ref title'
			'. meta';
		align-items: baseline;
		min-height: var(--size-row-comfortable);
		column-gap: var(--space-3);
		row-gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
	}

	.issue-row > .issue-ref {
		grid-area: ref;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.issue-row > .issue-title {
		grid-area: title;
		display: flex;
		min-width: 0;
		align-items: center;
		gap: var(--space-1);
	}

	.issue-meta {
		grid-area: meta;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		min-width: 0;
		font-size: var(--font-size-caption);
		line-height: var(--font-leading-caption);
		color: var(--color-text-secondary);
	}

	.issue-meta > * {
		flex: none;
		min-width: 0;
	}

	.issue-updated {
		font-variant-numeric: tabular-nums;
	}

	.issue-assignee {
		max-width: var(--layout-field-sm);
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
		.issue-row:not(.is-selected-row):hover {
			background: var(--color-surface);
		}
	}
</style>
