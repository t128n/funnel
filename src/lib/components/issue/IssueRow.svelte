<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import MetaTag from '#lib/components/common/MetaTag.svelte';
	import PriorityBadge from '#lib/components/common/PriorityBadge.svelte';
	import StatusIcon from '#lib/components/common/StatusIcon.svelte';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { issueRef } from '#lib/issue-ref';
	import { canonicalLabel } from '#lib/labels';
	import type { IssueListItem } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import BanIcon from '@lucide/svelte/icons/ban';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { GroupKey } from './grouping';

	/**
	 * Dense issue row shared by the Issues feed, the Inbox queue, and the board's
	 * Backlog list. Lays out on the shared `.issue-grid` template so every column
	 * holds its slot regardless of title length or missing metadata.
	 */
	interface Props {
		issue: IssueListItem;
		selected?: boolean;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
		/** When grouped by status the section header carries it, so the row omits its glyph. */
		groupedBy?: GroupKey | null;
	}

	let { issue, selected = false, repoShortcodes = {}, groupedBy = null }: Props = $props();

	const ref = $derived(issueRef(issue.repo, issue.number, repoShortcodes));
	const closed = $derived(issue.state === 'closed');
	const title = $derived(issue.title.trim() || 'Untitled');
	const untitled = $derived(issue.title.trim().length === 0);

	/** Non-reserved labels only; reserved groups render as dedicated affordances. */
	const labels = $derived(issue.labels.filter((label) => !canonicalLabel(label)));
	const visibleLabels = $derived(labels.slice(0, 2));
	const extraLabels = $derived(Math.max(0, labels.length - visibleLabels.length));

	const sizeText = $derived(
		issue.size === 'sm' ? 'S' : issue.size === 'md' ? 'M' : issue.size === 'lg' ? 'L' : null
	);
	const sizeColor = $derived(issue.size ? (canonicalLabel(issue.size)?.color ?? null) : null);
	const showStatus = $derived(groupedBy !== 'status');

	function select() {
		selectIssue(issue.repo, issue.number);
	}
</script>

<div
	class={cn(
		'issue-grid group/row cursor-pointer border-b border-[color:var(--surface-divider)] px-2 py-1.5 select-none transition-colors duration-[120ms] last:border-b-0',
		'hover:bg-[var(--surface-tag-bg)]',
		'focus-visible:outline-[1.5px] focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--surface-accent)]',
		selected && 'bg-[var(--surface-card-hover)] shadow-[inset_2px_0_0_var(--surface-accent)]'
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
	<!-- Leading slot: blocked marker, else the status glyph (unless the section owns it). -->
	<span class="flex items-center justify-center">
		{#if issue.blocked}
			<BanIcon class="text-destructive size-3.5" role="img" aria-label="Blocked" />
		{:else if showStatus}
			<StatusIcon
				status={closed ? 'done' : issue.status}
				label={closed ? 'Done' : (issue.status ?? 'No status')}
			/>
		{/if}
	</span>

	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class="mono text-muted-foreground min-w-0 truncate text-[11px]">
					{ref}
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{issue.repo}#{issue.number}</Tooltip.Content>
	</Tooltip.Root>

	<span class="flex min-w-0 items-center gap-1">
		<span
			class={cn(
				'min-w-0 truncate text-[13px]',
				closed ? 'text-muted-foreground' : 'text-foreground',
				untitled && 'text-muted-foreground italic'
			)}
			title={title}
		>
			{title}
		</span>
		{#if issue.labelConflict}
			<TriangleAlertIcon
				class="text-warning size-3.5 shrink-0"
				title="Conflicting reserved labels on GitHub"
			/>
		{/if}
	</span>

	<!-- Labels track (wide layouts only; hidden by `.issue-col-labels`). -->
	<span class="issue-col-labels min-w-0 items-center gap-1 overflow-hidden">
		{#if issue.milestone}
			<MetaTag
				label={issue.milestone.title || `${issue.milestone.repo}#${issue.milestone.number}`}
				title={`Milestone: ${issue.milestone.title} (${issue.milestone.repo}#${issue.milestone.number})`}
				class="shrink-0"
			/>
		{/if}
		{#each visibleLabels as label (label)}
			<MetaTag label={label} />
		{/each}
		{#if extraLabels > 0}
			<span class="text-muted-foreground shrink-0 text-[11px]">+{extraLabels}</span>
		{/if}
	</span>

	<span class="flex items-center">
		<PriorityBadge priority={issue.priority} />
	</span>

	<span class="flex items-center">
		{#if sizeText}
			<MetaTag label={sizeText} color={sizeColor} class="mono" title={`Size: ${issue.size}`} />
		{/if}
	</span>

	<span
		class="text-muted-foreground justify-self-end truncate text-[11px] tabular-nums"
		title={new Date(issue.updatedAt).toLocaleString()}
	>
		{timeAgo(issue.updatedAt)}
	</span>

	<span class="flex items-center justify-end">
		{#if issue.assignees.length > 0}
			<div class="flex items-center -space-x-1.5">
				{#each issue.assignees.slice(0, 2) as person (person.externalId)}
					<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
				{/each}
			</div>
		{/if}
	</span>
</div>
