<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { canonicalLabel } from '#lib/labels';
	import type { IssueListItem } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';

	interface Props {
		issue: IssueListItem;
		selected?: boolean;
	}

	let { issue, selected = false }: Props = $props();

	const closed = $derived(issue.state === 'closed');
	const statusColor = $derived(
		issue.status ? (canonicalLabel(issue.status)?.color ?? null) : null
	);
	const priorityColor = $derived(
		issue.priority ? (canonicalLabel(issue.priority)?.color ?? null) : null
	);
	const sizeColor = $derived(
		issue.size ? (canonicalLabel(issue.size)?.color ?? null) : null
	);

	function select() {
		selectIssue(issue.repo, issue.number);
	}
</script>

<div
	class={cn(
		'focus-visible:ring-ring/50 hover:bg-accent flex cursor-pointer flex-col gap-1 p-2 outline-none transition-colors select-none focus-visible:ring-1',
		selected && 'bg-accent'
	)}
	role="button"
	tabindex="0"
	aria-current={selected ? 'true' : undefined}
	onclick={select}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			select();
		}
	}}
>
	<div class="flex min-w-0 items-center gap-2">
		<span
			class={cn('size-2 shrink-0 rounded-full', closed ? 'bg-muted-foreground' : 'bg-primary')}
			title={closed ? 'Closed' : 'Open'}
		></span>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<span {...props} class="mono text-muted-foreground text-xs">
						#{issue.number}
					</span>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{issue.repo}#{issue.number}</Tooltip.Content>
		</Tooltip.Root>
		<span
			class={cn(
				'flex-1 truncate text-sm',
				closed ? 'text-muted-foreground' : 'text-foreground'
			)}
			title={issue.title}
		>
			{issue.title}
		</span>
		{#if issue.labelConflict}
			<TriangleAlertIcon
				class="text-warning size-3.5 shrink-0"
				title="Conflicting reserved labels on GitHub"
			/>
		{/if}
		<span class="text-muted-foreground shrink-0 text-xs" title={new Date(issue.updatedAt).toLocaleString()}>
			{timeAgo(issue.updatedAt)}
		</span>
	</div>
	{#if issue.status || issue.priority || issue.size || issue.assignees.length > 0}
		<div class="flex min-w-0 items-center gap-2 pl-4">
			{#if issue.status || issue.priority || issue.size}
				<div class="flex shrink-0 items-center gap-1">
					{#if issue.status}
						<Chip label={issue.status} color={statusColor} />
					{/if}
					{#if issue.priority}
						<Chip label={issue.priority.toUpperCase()} color={priorityColor} mono />
					{/if}
					{#if issue.size}
						<Chip label={issue.size} color={sizeColor} variant="outline" mono />
					{/if}
				</div>
			{/if}
			{#if issue.assignees.length > 0}
				<div class="ml-auto flex shrink-0 items-center gap-0.5">
					{#each issue.assignees.slice(0, 3) as person (person.githubId)}
						<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
