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
	import * as Tooltip from '#lib/components/primitives/tooltip/index.js';
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
	 * One row of the Bugzilla result table shared by the Issues feed, the Inbox
	 * queue and the board's Backlog list. Lays out on the shared `.issue-grid`
	 * template so every column holds its slot regardless of title length or
	 * missing metadata. Metadata is plain text: a mono reference, a status flag,
	 * `P1`–`P3`, the size letter, comma-separated labels, the updated time and
	 * comma-separated assignee logins. No chips, badges, glyphs or avatars.
	 */
	interface Props {
		issue: IssueListItem;
		selected?: boolean;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
		/** When grouped by status the section header carries it, so the row omits its flag. */
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

	/** Blocked wins the status slot: it is the one signal the row cannot drop. */
	const statusWord = $derived(
		issue.blocked
			? 'blocked'
			: closed
				? 'closed'
				: (issue.status?.replace(/-/g, ' ') ?? 'unconfirmed')
	);

	const statusClass = $derived(
		closed
			? 'flag-muted'
			: issue.blocked
				? 'flag-danger'
				: issue.status === 'done'
					? 'flag-success'
					: issue.status === 'in-progress' || issue.status === 'in-review'
						? 'flag-warning'
						: 'flag-muted'
	);

	const priorityClass = $derived(
		closed
			? 'flag-muted'
			: issue.priority === 'P1'
				? 'flag-danger'
				: issue.priority === 'P2'
					? 'flag-warning'
					: 'flag-muted'
	);

	const assigneeText = $derived(issue.assignees.map((person) => person.login).join(', '));

	const showStatus = $derived(groupedBy !== 'status');

	function select() {
		selectIssue(issue.repo, issue.number);
	}
</script>

<div
	class={cn(
		'issue-row issue-grid group/row cursor-pointer border-b border-border px-2 py-1.5 select-none transition-colors duration-[120ms]',
		'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
		closed && 'text-muted-foreground',
		selected && 'is-selected'
	)}
	data-striped={striped}
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
	<span aria-hidden="true"></span>

	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class="mono text-muted-foreground min-w-0 truncate text-xs">
					{ref}
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{issue.repo}#{issue.number}</Tooltip.Content>
	</Tooltip.Root>

	<span class="flex min-w-0 items-center gap-1.5">
		<span
			class={cn(
				'min-w-0 truncate text-sm',
				closed || untitled ? 'text-muted-foreground' : 'text-foreground',
				untitled && 'italic',
				closed && 'line-through'
			)}
			title={title}
		>
			{title}
		</span>
		{#if issue.labelConflict}
			<TriangleAlertIcon
				class="text-warning size-3.5 shrink-0"
				title="Conflicting reserved label or retired priority label on GitHub"
			/>
		{/if}
		{#if showStatus || issue.blocked}
			<span class={cn('flag shrink-0', statusClass)}>{statusWord}</span>
		{/if}
	</span>

	<!-- Labels track (wide layouts only; hidden by `.issue-col-labels`). -->
	<span class="issue-col-labels min-w-0 items-center overflow-hidden">
		<span class="flag flag-muted block truncate" title={labelText}>{labelText}</span>
	</span>

	<span class="flex items-center">
		{#if issue.priority}
			<span class={cn('flag', priorityClass)}>{issue.priority}</span>
		{/if}
	</span>

	<span class="flex items-center">
		{#if sizeText}
			<span class="flag flag-muted" title={`Size: ${issue.size}`}>{sizeText}</span>
		{/if}
	</span>

	<span
		class="text-muted-foreground justify-self-end truncate text-xs tabular-nums"
		title={new Date(issue.updatedAt).toLocaleString()}
	>
		{timeAgo(issue.updatedAt)}
	</span>

	<span class="flex min-w-0 items-center justify-end">
		{#if assigneeText}
			<span class="text-muted-foreground truncate text-xs" title={assigneeText}>
				{assigneeText}
			</span>
		{/if}
	</span>
</div>

<style>
	.issue-row[data-striped='true'] {
		background: color-mix(in srgb, var(--muted) 45%, transparent);
	}

	.issue-row:hover,
	.issue-row[data-striped='true']:hover {
		background: var(--accent);
	}

	/* Selection is a flat accent fill, never an inset accent bar. */
	.issue-row.is-selected,
	.issue-row.is-selected:hover {
		background: var(--accent);
		box-shadow: none;
	}
</style>
