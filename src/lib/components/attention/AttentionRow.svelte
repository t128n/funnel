<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import RefText from '#lib/components/common/RefText.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { attentionUrgency, quickRecheckDates, recheckDateLabel, recheckLabel } from '#lib/attention';
	import {
		assignToMe,
		requestBlock,
		requestClose,
		requestUnblock,
		rescheduleBlock,
		unassignFromMe
	} from '#lib/client/issue-actions.svelte';
	import { issuePath } from '#lib/issue-url';
	import { issueRef } from '#lib/issue-ref';
	import type { AttentionItem, UserRef } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
	import CalendarOffIcon from '@lucide/svelte/icons/calendar-off';
	import CheckIcon from '@lucide/svelte/icons/check';
	import Clock3Icon from '@lucide/svelte/icons/clock-3';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import UserRoundMinusIcon from '@lucide/svelte/icons/user-round-minus';
	import UserRoundPlusIcon from '@lucide/svelte/icons/user-round-plus';

	/**
	 * One blocked issue on the Attention list: urgency icon + word + re-check
	 * date, the mono reference, the title, a blocker summary and the assignee.
	 * Urgency colour is always paired with the icon and word; group headings stay
	 * neutral. Quick reschedule/assign/done actions appear on hover or focus, and
	 * the persistent row menu carries every action for touch and keyboard use.
	 */
	interface Props {
		item: AttentionItem;
		today: string;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes?: Record<string, string>;
		/** Signed-in viewer, when their GitHub identity is mirrored. */
		viewer?: UserRef | null;
	}

	let { item, today, repoShortcodes = {}, viewer = null }: Props = $props();

	const issue = $derived(item.issue);
	const href = $derived(issuePath('issues', issue.repo, issue.number));
	const ref = $derived(issueRef(issue.repo, issue.number, repoShortcodes));

	const urgency = $derived(attentionUrgency(item.recheck, today));
	const urgencyLabel = $derived(
		urgency === 'overdue'
			? 'Overdue'
			: urgency === 'today'
				? 'Due today'
				: urgency === 'upcoming'
					? 'Upcoming'
					: 'No date'
	);
	const urgencyTone = $derived(
		urgency === 'overdue'
			? 'status-error'
			: urgency === 'today'
				? 'status-warning'
				: 'status-muted'
	);
	const UrgencyIcon = $derived(
		urgency === 'overdue'
			? TriangleAlertIcon
			: urgency === 'today'
				? Clock3Icon
				: urgency === 'upcoming'
					? CalendarClockIcon
					: CalendarOffIcon
	);

	const dateTitle = $derived(
		urgency === 'unscheduled'
			? 'No re-check date — set one'
			: `Re-check ${recheckDateLabel(item.recheck)} (${recheckLabel(item.recheck, today)})`
	);

	const assignedToViewer = $derived(
		viewer != null && issue.assignees.some((person) => person.externalId === viewer.externalId)
	);
	const assigneeText = $derived(issue.assignees.map((person) => person.login).join(', '));

	const quickDates = $derived(quickRecheckDates(today));

	const actionButton =
		'inline-flex size-(--size-control-sm) shrink-0 items-center justify-center rounded-sm text-fg-secondary outline-none hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

	/** Defer the re-check without re-recording the block, then reload the feed. */
	async function snooze(value: string) {
		const ok = await rescheduleBlock(
			issue,
			{ blocker: item.blocker, needs: item.needs, trying: item.trying },
			value
		);
		if (ok) void invalidateAll();
	}

	function toggleAssign() {
		if (!viewer) return;
		void (assignedToViewer ? unassignFromMe(issue, viewer) : assignToMe(issue, viewer));
	}
</script>

{#snippet recheckItems()}
	<DropdownMenu.Label>Re-check</DropdownMenu.Label>
	{#each quickDates as option (option.value)}
		<DropdownMenu.Item class="gap-2" onSelect={() => void snooze(option.value)}>
			<span class="flex-1 truncate">{option.label}</span>
			<span class="mono text-caption text-fg-muted">{option.value}</span>
		</DropdownMenu.Item>
	{/each}
	<DropdownMenu.Item class="gap-2" onSelect={() => requestBlock(issue)}>
		Custom date…
	</DropdownMenu.Item>
{/snippet}

<div
	role="listitem"
	class="group/row relative flex min-h-(--size-row-compact) items-center gap-3 px-3 py-1.5 hover:bg-surface-2"
>
	<!-- Stretched link: the whole row opens the issue; controls layer above it. -->
	<a
		{href}
		class="absolute inset-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
		aria-label={`Open ${issue.repo}#${issue.number}: ${issue.title}`}
	></a>

	<div class="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
		<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
			<span class={cn('status shrink-0', urgencyTone)} title={dateTitle}>
				<UrgencyIcon aria-hidden="true" />
				<span>{urgencyLabel}</span>
			</span>

			{#if urgency === 'unscheduled'}
				<span class="shrink-0 text-caption text-fg-secondary" title={dateTitle}>
					No re-check date
				</span>
			{:else}
				<time
					class="shrink-0 text-caption text-fg-secondary tabular-nums"
					datetime={item.recheck}
					title={dateTitle}
				>
					{recheckDateLabel(item.recheck)}
				</time>
			{/if}

			<RefText value={ref} title={`${issue.repo}#${issue.number}`} class="shrink-0" />

			<span class="min-w-0 flex-1 truncate text-body text-fg" title={issue.title}>
				{issue.title}
			</span>
		</div>

		<div class="flex min-w-0 items-center gap-2 text-caption text-fg-secondary">
			<span class="min-w-0 flex-1 truncate" title={item.blocker}>
				{item.blocker || 'No blocker summary'}
			</span>
			<span class="shrink-0 truncate" title={assigneeText}>
				{assigneeText || 'Unassigned'}
			</span>
		</div>
	</div>

	<div class="relative z-10 flex shrink-0 items-center gap-1">
		<!-- Desktop quick actions: hover/focus only; every one is also in the menu. -->
		<div
			class="hidden items-center gap-1 md:flex md:pointer-events-none md:opacity-0 md:group-hover/row:pointer-events-auto md:group-hover/row:opacity-100 md:group-focus-within/row:pointer-events-auto md:group-focus-within/row:opacity-100"
		>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class={actionButton}
					title={urgency === 'unscheduled' ? 'Set re-check date' : 'Reschedule re-check'}
					aria-label={urgency === 'unscheduled' ? 'Set re-check date' : 'Reschedule re-check'}
				>
					<CalendarClockIcon class="size-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-52">
					{@render recheckItems()}
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			{#if viewer}
				<button
					type="button"
					class={actionButton}
					title={assignedToViewer ? 'Unassign me' : 'Assign to me'}
					aria-label={assignedToViewer ? 'Unassign me' : 'Assign to me'}
					onclick={toggleAssign}
				>
					{#if assignedToViewer}
						<UserRoundMinusIcon class="size-4" />
					{:else}
						<UserRoundPlusIcon class="size-4" />
					{/if}
				</button>
			{/if}

			<button
				type="button"
				class={actionButton}
				title="Mark done"
				aria-label="Mark done"
				onclick={() => requestClose(issue)}
			>
				<CheckIcon class="size-4" />
			</button>
		</div>

		<!-- Always available: the same actions for touch and keyboard users. -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class={actionButton}
				title="Issue actions"
				aria-label="Issue actions"
			>
				<EllipsisIcon class="size-4" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-56">
				{@render recheckItems()}
				<DropdownMenu.Separator />
				{#if viewer}
					<DropdownMenu.Item class="gap-2" onSelect={toggleAssign}>
						{assignedToViewer ? 'Unassign me' : 'Assign to me'}
					</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Item class="gap-2" onSelect={() => requestClose(issue)}>
					Mark done
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item class="gap-2" onSelect={() => requestBlock(issue)}>
					Update block…
				</DropdownMenu.Item>
				<DropdownMenu.Item class="gap-2" onSelect={() => requestUnblock(issue)}>
					Unblock…
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item class="gap-2" onSelect={() => void goto(href)}>
					Open issue
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>
