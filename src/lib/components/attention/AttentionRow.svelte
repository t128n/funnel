<script lang="ts">
	import { goto } from '$app/navigation';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import PriorityIcon from '#lib/components/common/PriorityIcon.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { daysBetween, recheckDateLabel, recheckLabel } from '#lib/attention';
	import { requestBlock, requestUnblock } from '#lib/client/issue-actions.svelte';
	import { issuePath } from '#lib/issue-url';
	import { canonicalLabel } from '#lib/labels';
	import type { AttentionItem } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import BanIcon from '@lucide/svelte/icons/ban';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import ClockAlertIcon from '@lucide/svelte/icons/clock-alert';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	/**
	 * One blocked issue on the Attention list. The re-check timing leads the row
	 * (accent bar + badge), with the context needed to triage — priority, repo,
	 * assignees, status — beneath it. The body links into the Issues view; the
	 * menu revises the block in place (which is how a re-check is deferred).
	 */
	interface Props {
		item: AttentionItem;
		today: string;
	}

	let { item, today }: Props = $props();

	const issue = $derived(item.issue);
	const href = $derived(issuePath('issues', issue.repo, issue.number));

	const days = $derived(daysBetween(today, item.recheck));
	const urgency = $derived(days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming');

	const TONE = {
		overdue: {
			card: 'border-destructive/30 border-l-destructive',
			badge: 'border-destructive/40 bg-destructive/10 text-destructive',
			icon: 'text-destructive'
		},
		today: {
			card: 'border-warning/40 border-l-warning',
			badge: 'border-warning/50 bg-warning/10 text-warning',
			icon: 'text-warning'
		},
		upcoming: {
			card: 'border-border border-l-border',
			badge: 'border-border bg-muted text-muted-foreground',
			icon: 'text-muted-foreground'
		}
	} as const;
	const tone = $derived(TONE[urgency]);

	const statusColor = $derived(
		issue.status ? (canonicalLabel(issue.status)?.color ?? null) : null
	);
	const sizeColor = $derived(issue.size ? (canonicalLabel(issue.size)?.color ?? null) : null);
</script>

<div
	role="listitem"
	class={cn(
		'group/row flex items-stretch gap-2 rounded-lg border border-l-2 py-2 pr-2 pl-3 transition-colors',
		tone.card
	)}
>
	<a
		{href}
		class="focus-visible:ring-ring/50 flex min-w-0 flex-1 flex-col gap-1 rounded-md no-underline outline-none focus-visible:ring-1"
		aria-label={`Open ${issue.repo}#${issue.number}: ${issue.title}`}
	>
		<div class="flex min-w-0 items-center gap-2">
			<PriorityIcon priority={issue.priority} />
			<span class="min-w-0 flex-1 truncate text-sm font-medium" title={issue.title}>
				{issue.title}
			</span>
		</div>

		<div class="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
			<span class="mono shrink-0">{issue.repo}#{issue.number}</span>
			{#if issue.assignees.length > 0}
				<span class="flex shrink-0 items-center gap-0.5">
					{#each issue.assignees.slice(0, 3) as person (person.githubId)}
						<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
					{/each}
				</span>
			{:else}
				<span class="shrink-0 italic">Unassigned</span>
			{/if}
			{#if issue.status}
				<Chip label={issue.status} color={statusColor} />
			{/if}
			{#if issue.size}
				<Chip label={issue.size} color={sizeColor} variant="outline" mono />
			{/if}
		</div>

		{#if item.blocker}
			<div class="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
				<BanIcon class={cn('size-3 shrink-0', tone.icon)} aria-hidden="true" />
				<span
					class="truncate"
					title={item.needs ? `${item.blocker} — needs: ${item.needs}` : item.blocker}
				>
					{item.blocker}
				</span>
			</div>
		{/if}
	</a>

	<div class="flex shrink-0 flex-col items-end justify-between gap-1">
		<span
			class={cn(
				'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
				tone.badge
			)}
			title={`Re-check ${recheckDateLabel(item.recheck)}`}
		>
			<ClockAlertIcon class="size-3.5" aria-hidden="true" />
			{recheckLabel(item.recheck, today)}
		</span>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-6 items-center justify-center rounded outline-none transition-opacity focus-visible:ring-1 data-[state=open]:opacity-100 max-md:opacity-100 md:opacity-0 md:group-hover/row:opacity-100"
			>
				<EllipsisIcon class="size-3.5" />
				<span class="sr-only">Issue actions</span>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-52">
				<DropdownMenu.Item class="gap-2" onSelect={() => requestBlock(issue)}>
					<BanIcon class="text-destructive size-3.5" />
					Update block…
				</DropdownMenu.Item>
				<DropdownMenu.Item class="gap-2" onSelect={() => requestUnblock(issue)}>
					<CircleCheckIcon class="size-3.5" />
					Unblock…
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item class="gap-2" onSelect={() => void goto(href)}>
					<ExternalLinkIcon class="size-3.5" />
					Open issue
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>
