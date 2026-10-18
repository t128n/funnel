<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { canonicalLabel } from '#lib/labels';
	import { relativeTime } from '#lib/time';
	import type { IssueListItem } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

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
		<span class="mono text-muted-foreground text-xs">#{issue.number}</span>
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
				class="text-amber-500 size-3.5 shrink-0"
				title="Conflicting reserved labels on GitHub"
			/>
		{/if}
		<span class="text-muted-foreground shrink-0 text-xs" title={new Date(issue.updatedAt).toLocaleString()}>
			{relativeTime(issue.updatedAt)}
		</span>
	</div>
	<div class="flex min-w-0 items-center gap-2 pl-4">
		<span class="mono text-muted-foreground min-w-0 flex-1 truncate text-xs">{issue.repo}</span>
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
</div>
