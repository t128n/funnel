<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { canonicalLabel } from '#lib/labels';
	import type { IssueListItem } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import * as Item from '#lib/components/ui/item/index.js';
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
	const hasChips = $derived(Boolean(issue.status || issue.priority || issue.size));

	function select() {
		selectIssue(issue.repo, issue.number);
	}
</script>

<Item.Root
	size="xs"
	class={cn('cursor-pointer select-none hover:bg-accent', selected && 'bg-accent')}
	role="button"
	tabindex={0}
	aria-current={selected ? 'true' : undefined}
	onclick={select}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			select();
		}
	}}
>
	<Item.Content class="min-w-0">
		<Item.Title class="w-full min-w-0 items-center gap-2">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<span {...props} class="mono text-muted-foreground shrink-0 text-xs">
							#{issue.number}
						</span>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{issue.repo}#{issue.number}</Tooltip.Content>
			</Tooltip.Root>
			<span
				class={cn('min-w-0 flex-1 truncate', closed ? 'text-muted-foreground' : 'text-foreground')}
				title={issue.title}
			>
				{issue.title}
			</span>
		</Item.Title>

		{#if hasChips}
			<div class="flex shrink-0 flex-wrap items-center gap-1">
				{#if issue.status}
					<Chip label={issue.status} color={statusColor} />
				{/if}
				{#if issue.priority}
					<Chip label={issue.priority} color={priorityColor} mono />
				{/if}
				{#if issue.size}
					<Chip label={issue.size} color={sizeColor} variant="outline" mono />
				{/if}
			</div>
		{/if}
	</Item.Content>

	<Item.Actions class="shrink-0 flex-col items-end gap-1 self-start pt-0.5">
		<div class="flex items-center gap-1">
			{#if issue.labelConflict}
				<TriangleAlertIcon
					class="text-warning size-3.5 shrink-0"
					title="Conflicting reserved labels on GitHub"
				/>
			{/if}
			<span
				class="text-muted-foreground text-xs"
				title={new Date(issue.updatedAt).toLocaleString()}
			>
				{timeAgo(issue.updatedAt)}
			</span>
		</div>
		{#if issue.assignees.length > 0}
			<div class="flex items-center gap-0.5">
				{#each issue.assignees.slice(0, 3) as person (person.githubId)}
					<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
				{/each}
			</div>
		{/if}
	</Item.Actions>
</Item.Root>
