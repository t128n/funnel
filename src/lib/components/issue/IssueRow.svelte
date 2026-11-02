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
	 * the board's Backlog list. The row is one grid in table mode
	 * (`Ref · Title · Status · Priority · Size · Updated · Assignee`) and a
	 * two-line stacked card in a narrow column: ref and title, then a wrapping
	 * metadata line. Selection is the 2px primary leading bar, never a fill.
	 */
	interface Props {
		issue: IssueListItem;
		selected?: boolean;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
		/** When grouped by status the section header carries it, so the row omits its status. */
		groupedBy?: GroupKey | null;
		/** Position in the flattened feed; odd positions take the zebra stripe. */
		index?: number;
	}

	let {
		issue,
		selected = false,
		repoShortcodes = {},
		groupedBy = null,
		index = 0
	}: Props = $props();

	const ref = $derived(issueRef(issue.repo, issue.number, repoShortcodes));
	const closed = $derived(isStruckThrough(issue.state));
	const striped = $derived(index % 2 === 1);
	const title = $derived(issue.title.trim() || 'Untitled');
	const untitled = $derived(issue.title.trim().length === 0);

	/** Non-reserved labels only; reserved groups render as dedicated columns. */
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
	const labelText = $derived(
		[milestoneText, ...labels].filter((value): value is string => Boolean(value)).join(', ')
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
		selected ? 'is-selected-row bg-canvas' : striped ? 'bg-surface' : 'bg-canvas'
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

	<span class="issue-title flex min-w-0 items-center gap-1.5">
		<span
			class={cn(
				'min-w-0 truncate text-body',
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
		<span class="issue-status">
			{#if showStatus}
				<StatusText
					status={issue.status}
					state={issue.state}
					blocked={issue.blocked}
					class={closed ? 'text-fg-muted' : undefined}
				/>
			{/if}
		</span>

		<span class="issue-priority">
			{#if issue.priority}
				<PriorityText
					priority={issue.priority}
					class={closed ? 'text-fg-muted' : undefined}
				/>
			{/if}
		</span>

		<span class="issue-size text-caption text-fg-secondary">
			{#if sizeText}
				<span title={`Size: ${issue.size}`}>{sizeText}</span>
			{/if}
		</span>

		<span
			class="issue-updated text-caption text-fg-secondary tabular-nums"
			title={new Date(issue.updatedAt).toLocaleString()}
		>
			{timeAgo(issue.updatedAt)}
		</span>

		<span class="issue-assignee text-caption text-fg-secondary">
			{#if assigneeText}
				<span class="truncate" title={assigneeText}>{assigneeText}</span>
			{:else}
				<span class="text-fg-muted">Unassigned</span>
			{/if}
		</span>

		{#if labelText}
			<span class="issue-labels text-caption text-fg-secondary" title={labelText}>
				{labelText}
			</span>
		{/if}
	</span>
</div>

<style>
	/* Base: the stacked presentation. Any list narrower than 48rem — a phone or
	   the 26rem Issues feed — gets ref + title and a wrapping metadata line. */
	.issue-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas:
			'ref title'
			'meta meta';
		align-items: center;
		min-height: var(--size-row-compact);
		column-gap: var(--space-2);
		row-gap: 0.125rem;
		padding: var(--space-1) var(--space-3);
	}

	.issue-row > .issue-ref {
		grid-area: ref;
		min-width: 0;
	}

	.issue-row > .issue-title {
		grid-area: title;
		min-width: 0;
	}

	.issue-meta {
		grid-area: meta;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.125rem var(--space-3);
		min-width: 0;
	}

	.issue-status,
	.issue-priority,
	.issue-size,
	.issue-updated,
	.issue-assignee {
		min-width: 0;
	}

	.issue-assignee {
		max-width: 100%;
		overflow: hidden;
	}

	.issue-labels {
		display: block;
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (hover: hover) and (pointer: fine) {
		.issue-row:not(.is-selected-row):hover {
			background: var(--color-surface-2);
		}
	}

	/* Table presentation once the list column has room for seven columns. */
	@container (min-width: 48rem) {
		.issue-row {
			grid-template-columns: 5.5rem minmax(0, 1fr) 7rem 4.5rem 3rem 5rem 7rem;
			grid-template-areas: none;
			height: var(--size-row-compact);
			column-gap: 0;
			row-gap: 0;
			padding: 0;
		}

		.issue-row > .issue-ref {
			grid-area: auto;
			grid-column: 1;
			padding-inline: var(--space-3);
		}

		.issue-row > .issue-title {
			grid-area: auto;
			grid-column: 2;
			padding-inline: var(--space-3);
		}

		.issue-meta {
			grid-area: auto;
			display: contents;
		}

		.issue-status {
			grid-column: 3;
			padding-inline: var(--space-3);
		}

		.issue-priority {
			grid-column: 4;
			padding-inline: var(--space-3);
		}

		.issue-size {
			grid-column: 5;
			padding-inline: var(--space-3);
		}

		.issue-updated {
			grid-column: 6;
			justify-self: end;
			padding-inline: var(--space-3);
		}

		.issue-assignee {
			grid-column: 7;
			justify-self: end;
			max-width: 100%;
			padding-inline: var(--space-3);
		}

		.issue-labels {
			display: none;
		}
	}
</style>
