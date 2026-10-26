<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import * as DropdownMenu from '#lib/components/primitives/dropdown-menu/index.js';
	import * as Tooltip from '#lib/components/primitives/tooltip/index.js';
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

	/**
	 * One blocked issue on the Attention list, flattened to a single scannable
	 * line: a mono urgency flag, the short `FIT-13` reference, the 13px title
	 * and a text-action tray that triages in place — reschedule the re-check,
	 * assign or unassign, mark it done, or open the full menu.
	 *
	 * Urgency is the only coloured token. The row itself is a zebra table row;
	 * the whole row opens the issue, controls layer above the stretched link.
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

	const flagClass = $derived(
		urgency === 'overdue'
			? 'flag-danger'
			: urgency === 'today'
				? 'flag-warning'
				: 'flag-muted'
	);

	const urgencyLabel = $derived(
		urgency === 'unscheduled' ? 'no date' : recheckLabel(item.recheck, today)
	);

	const assignedToViewer = $derived(
		viewer != null && issue.assignees.some((person) => person.externalId === viewer.externalId)
	);

	const quickDates = $derived(quickRecheckDates(today));

	const actionLink = 'link text-xs font-normal';

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

<div
	role="listitem"
	class="attention-row group/row relative flex items-center gap-3 px-2 py-1.5 transition-colors"
>
	<!-- Stretched link: the whole row opens the issue; controls layer above it. -->
	<a
		{href}
		class="absolute inset-0"
		aria-label={`Open ${issue.repo}#${issue.number}: ${issue.title}`}
	></a>

	<span
		class={cn('flag shrink-0', flagClass)}
		title={urgency === 'unscheduled'
			? 'No re-check date — set one'
			: `Re-check ${recheckDateLabel(item.recheck)}`}
	>
		{urgencyLabel}
	</span>

	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class="mono text-muted-foreground shrink-0 text-xs">{ref}</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{issue.repo}#{issue.number}</Tooltip.Content>
	</Tooltip.Root>

	<span class="text-foreground min-w-0 flex-1 truncate text-sm" title={issue.title}>
		{issue.title}
	</span>

	<!-- Hover tray: triage in place. Overlays the row on `md`+; flows inline
	     (always visible) on touch. -->
	<div
		class="relative z-10 flex shrink-0 items-center gap-2 md:pointer-events-none md:absolute md:end-1 md:bg-linear-to-l md:from-[var(--accent)] md:from-70% md:to-transparent md:pl-6 md:opacity-0 md:transition-opacity md:group-hover/row:pointer-events-auto md:group-hover/row:opacity-100 md:group-focus-within/row:pointer-events-auto md:group-focus-within/row:opacity-100"
	>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class={actionLink}
				title={urgency === 'unscheduled' ? 'Set re-check date' : 'Reschedule re-check'}
				aria-label={urgency === 'unscheduled' ? 'Set re-check date' : 'Reschedule re-check'}
			>
				{urgency === 'unscheduled' ? 'set date' : 'reschedule'}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-52">
				<DropdownMenu.Label>Re-check</DropdownMenu.Label>
				{#each quickDates as option (option.label)}
					<DropdownMenu.Item class="gap-2" onSelect={() => void snooze(option.value)}>
						<span class="flex-1 truncate">{option.label}</span>
						<span class="mono text-muted-foreground text-2xs">{option.value}</span>
					</DropdownMenu.Item>
				{/each}
				<DropdownMenu.Separator />
				<DropdownMenu.Item class="gap-2" onSelect={() => requestBlock(issue)}>
					Custom date…
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		{#if viewer}
			<button
				type="button"
				class={actionLink}
				title={assignedToViewer ? 'Unassign me' : 'Assign to me'}
				aria-label={assignedToViewer ? 'Unassign me' : 'Assign to me'}
				onclick={toggleAssign}
			>
				{assignedToViewer ? 'unassign' : 'assign'}
			</button>
		{/if}

		<button
			type="button"
			class={actionLink}
			title="Mark done"
			aria-label="Mark done"
			onclick={() => requestClose(issue)}
		>
			done
		</button>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger class={actionLink}>
				more
				<span class="sr-only">Issue actions</span>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-52">
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

<style>
	.attention-row:nth-child(even) {
		background: color-mix(in srgb, var(--muted) 45%, transparent);
	}

	.attention-row:hover,
	.attention-row:nth-child(even):hover {
		background: var(--accent);
	}
</style>
