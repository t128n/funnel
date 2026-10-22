<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import MetaTag from '#lib/components/common/MetaTag.svelte';
	import PriorityIcon from '#lib/components/common/PriorityIcon.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { daysBetween, quickRecheckDates, recheckDateLabel, recheckLabel } from '#lib/attention';
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
	import { canonicalLabel } from '#lib/labels';
	import { isRetiredPriorityLabel } from '#lib/priority';
	import type { AttentionItem, UserRef } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import BanIcon from '@lucide/svelte/icons/ban';
	import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import ClockAlertIcon from '@lucide/svelte/icons/clock-alert';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import UserMinusIcon from '@lucide/svelte/icons/user-minus';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

	/**
	 * One blocked issue on the Attention list, flattened to a single scannable
	 * line: the re-check pill leads (urgency stripe + tinted pill), then
	 * priority, the short `FIT-13` reference, and the dominant title, with a
	 * quiet metadata tray (labels, Blocked, estimate, assignees) and a hover
	 * action tray that triages in place — reschedule the re-check, assign
	 * or assignee, or mark it done — without leaving the view.
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

	const days = $derived(daysBetween(today, item.recheck));
	const urgency = $derived(days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming');

	/**
	 * Urgency is carried by a quiet leading stripe and a tinted pill, never by a
	 * heavy enclosing border — it reads at a glance without boxing the row in.
	 */
	const TONE = {
		overdue: {
			stripe: 'bg-destructive',
			badge: 'border-destructive/30 bg-destructive/10 text-destructive'
		},
		today: {
			stripe: 'bg-warning',
			badge: 'border-warning/40 bg-warning/10 text-warning'
		},
		upcoming: {
			stripe: 'bg-[color:var(--surface-border)]',
			badge: 'border-[color:var(--surface-border)] bg-[var(--surface-tag-bg)] text-muted-foreground'
		}
	} as const;
	const tone = $derived(TONE[urgency]);

	/** Non-reserved labels only; reserved groups render as dedicated affordances. */
	const labels = $derived(issue.labels.filter(
		(label) => !canonicalLabel(label) && !isRetiredPriorityLabel(label)
	).slice(0, 2));
	const sizeText = $derived(
		issue.size === 'sm' ? 'S' : issue.size === 'md' ? 'M' : issue.size === 'lg' ? 'L' : null
	);
	const sizeColor = $derived(issue.size ? (canonicalLabel(issue.size)?.color ?? null) : null);

	const blockerTitle = $derived(
		item.needs ? `${item.blocker} — needs: ${item.needs}` : item.blocker || 'Blocked'
	);
	const assignedToViewer = $derived(
		viewer != null && issue.assignees.some((person) => person.externalId === viewer.externalId)
	);

	const quickDates = $derived(quickRecheckDates(today));

	const actionBtn =
		'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-6 items-center justify-center rounded outline-none transition-colors focus-visible:ring-1';

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
	class="group/row relative flex h-11 items-center gap-2 pr-2 pl-3 transition-colors hover:bg-[var(--surface-card-hover)]"
>
	<span class={cn('absolute inset-y-1.5 start-0 w-[2px] rounded-full', tone.stripe)} aria-hidden="true"
	></span>

	<!-- Stretched link: the whole row opens the issue; controls layer above it. -->
	<a
		{href}
		class="focus-visible:ring-ring/50 absolute inset-0 outline-none focus-visible:ring-1"
		aria-label={`Open ${issue.repo}#${issue.number}: ${issue.title}`}
	></a>

	<span
		class={cn(
			'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
			tone.badge
		)}
		title={`Re-check ${recheckDateLabel(item.recheck)}`}
	>
		<ClockAlertIcon class="size-3" aria-hidden="true" />
		{recheckLabel(item.recheck, today)}
	</span>

	<PriorityIcon priority={issue.priority} />

	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class="mono text-muted-foreground shrink-0 text-[11px]">{ref}</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{issue.repo}#{issue.number}</Tooltip.Content>
	</Tooltip.Root>

	<span class="min-w-0 flex-1 truncate text-[13px]" title={issue.title}>{issue.title}</span>

	<div class="flex shrink-0 items-center gap-1.5">
		{#each labels as label (label)}
			<MetaTag label={label} class="hidden shrink-0 lg:inline-flex" />
		{/each}

		<MetaTag label="Blocked" tone="danger" title={blockerTitle} class="hidden shrink-0 sm:inline-flex">
			<BanIcon class="size-3" aria-hidden="true" />
		</MetaTag>

		{#if sizeText}
			<MetaTag
				label={sizeText}
				color={sizeColor}
				class="mono hidden shrink-0 sm:inline-flex"
				title={`Size: ${issue.size}`}
			/>
		{/if}

		{#if issue.assignees.length > 0}
			<div class="hidden shrink-0 items-center -space-x-1.5 sm:flex">
				{#each issue.assignees.slice(0, 3) as person (person.externalId)}
					<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
				{/each}
			</div>
		{/if}
	</div>

	<!-- Hover tray: triage in place. Overlays the metadata on `md`+; flows
	     inline (always visible) on touch, below the tray's hidden extras. -->
	<div
		class="relative z-10 flex shrink-0 items-center gap-0.5 md:pointer-events-none md:absolute md:end-1 md:bg-linear-to-l md:from-[var(--surface-card-hover)] md:from-70% md:to-transparent md:pl-8 md:opacity-0 md:transition-opacity md:group-hover/row:pointer-events-auto md:group-hover/row:opacity-100 md:group-focus-within/row:pointer-events-auto md:group-focus-within/row:opacity-100"
	>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger class={actionBtn} title="Reschedule re-check" aria-label="Reschedule re-check">
				<CalendarClockIcon class="size-3.5" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-52">
				<DropdownMenu.Label>Re-check</DropdownMenu.Label>
				{#each quickDates as option (option.label)}
					<DropdownMenu.Item class="gap-2" onSelect={() => void snooze(option.value)}>
						<span class="flex-1 truncate">{option.label}</span>
						<span class="mono text-muted-foreground text-[10px]">{option.value}</span>
					</DropdownMenu.Item>
				{/each}
				<DropdownMenu.Separator />
				<DropdownMenu.Item class="gap-2" onSelect={() => requestBlock(issue)}>
					<BanIcon class="text-destructive size-3.5" />
					Custom date…
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		{#if viewer}
			<button
				type="button"
				class={actionBtn}
				title={assignedToViewer ? 'Unassign me' : 'Assign to me'}
				aria-label={assignedToViewer ? 'Unassign me' : 'Assign to me'}
				onclick={toggleAssign}
			>
				{#if assignedToViewer}
					<UserMinusIcon class="size-3.5" />
				{:else}
					<UserPlusIcon class="size-3.5" />
				{/if}
			</button>
		{/if}

		<button
			type="button"
			class={actionBtn}
			title="Mark done"
			aria-label="Mark done"
			onclick={() => requestClose(issue)}
		>
			<CircleCheckIcon class="size-3.5" />
		</button>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger class={actionBtn}>
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
