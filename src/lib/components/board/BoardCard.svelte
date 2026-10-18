<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import MetaTag from '#lib/components/common/MetaTag.svelte';
	import PriorityIcon from '#lib/components/common/PriorityIcon.svelte';
	import StatusIcon from '#lib/components/common/StatusIcon.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import {
		clearFocusedCard,
		clearMenuRequest,
		clearOpenRequest,
		getMenuRequestKey,
		getOpenRequestKey,
		setFocusedCard
	} from '#lib/client/board-ui.svelte';
	import {
		assignToMe,
		moveToStatus,
		requestBlock,
		requestClose,
		requestReopen,
		requestUnblock,
		setPriority
	} from '#lib/client/issue-actions.svelte';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { issueRef } from '#lib/issue-ref';
	import { canonicalLabel, PRIORITY_OPTIONS, STATUS_OPTIONS } from '#lib/labels';
	import type { IssueListItem, UserRef } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import BanIcon from '@lucide/svelte/icons/ban';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SignalZeroIcon from '@lucide/svelte/icons/signal-zero';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

	/**
	 * One draggable board card, laid out as a fixed-slot stack (SPEC §9.3) rather
	 * than a content-driven flow, so scanning a lane keeps every field in place:
	 *
	 * - **Head** — a blocked marker only when flagged (the column already carries
	 *   the workflow status, so unblocked cards keep their reference flush left),
	 *   the reference + repo, and a right gutter reserved for the hover tray.
	 * - **Title** — the dominant line; the reserved-label conflict marker rides
	 *   beside it, mirroring the issue list.
	 * - **Metadata grid** — priority, size, labels, and assignees each own a
	 *   column. The fixed priority/size/assignee slots keep those fields aligned
	 *   down a lane, while the optional label track flexes between them instead of
	 *   pushing the size tag around. Priority reads as a tinted `P1`–`P3` pill so
	 *   its meaning is legible without a column header (the list gets that context
	 *   from `IssueListHeader`).
	 */
	interface Props {
		issue: IssueListItem;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes: Record<string, string>;
		/** Show the repository context tag when the board spans multiple repos. */
		showRepo?: boolean;
		/** Signed-in viewer, when their GitHub identity is mirrored. */
		viewer?: UserRef | null;
		/** Roving tab index owned by the board. */
		tabIndex?: number;
	}

	let {
		issue,
		repoShortcodes,
		showRepo = false,
		viewer = null,
		tabIndex = -1
	}: Props = $props();

	const key = $derived(`${issue.repo}#${issue.number}`);
	const ref = $derived(issueRef(issue.repo, issue.number, repoShortcodes));
	const closed = $derived(issue.state === 'closed');
	const shortRepo = $derived(issue.repo.split('/')[1] ?? issue.repo);

	/** Non-reserved labels only; reserved groups render as dedicated affordances. */
	const labels = $derived(issue.labels.filter((label) => !canonicalLabel(label)));
	const visibleLabels = $derived(labels.slice(0, 2));
	const extraLabels = $derived(Math.max(0, labels.length - visibleLabels.length));

	const sizeText = $derived(
		issue.size === 'sm' ? 'S' : issue.size === 'md' ? 'M' : issue.size === 'lg' ? 'L' : null
	);
	const sizeColor = $derived(issue.size ? (canonicalLabel(issue.size)?.color ?? null) : null);

	/** Priority reads as text on a card: no header explains a bare glyph here. */
	const priorityLabel = $derived(issue.priority ? issue.priority.toUpperCase() : null);
	const priorityColor = $derived(
		issue.priority ? (canonicalLabel(issue.priority)?.color ?? null) : null
	);
	const priorityTitle = $derived(
		issue.priority ? (canonicalLabel(issue.priority)?.description ?? 'Priority') : 'No priority'
	);

	const stage = $derived(closed ? 'done' : (issue.status ?? ''));
	const stageOptions = $derived([
		...STATUS_OPTIONS,
		{ value: 'done', label: 'Done', color: 'var(--syntax-constant)' }
	]);
	const priorityOptions = $derived([
		{ value: 'none', label: 'No priority', color: null },
		...PRIORITY_OPTIONS
	]);

	const canAssign = $derived(
		viewer != null && !issue.assignees.some((person) => person.githubId === viewer.githubId)
	);

	/** The `S` shortcut raises this card's menu via the shared focus store. */
	let menuOpen = $state(false);
	$effect(() => {
		if (getMenuRequestKey() === key) {
			menuOpen = true;
			clearMenuRequest();
		}
		if (getOpenRequestKey() === key) {
			clearOpenRequest();
			open();
		}
	});

	function open() {
		selectIssue(issue.repo, issue.number);
	}

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!next || !event.currentTarget || !(event.currentTarget as HTMLElement).contains(next)) {
			clearFocusedCard(key);
		}
	}

	/** Card activation, unless the click landed on a nested control. */
	function activate(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		if (target?.closest('button, a, input, textarea, select')) return;
		open();
	}
</script>

<div
	class={cn(
		'board-card group/card relative flex cursor-grab flex-col rounded-md border p-2.5 transition-colors',
		'border-[color:var(--surface-border)] bg-[var(--surface-card)]',
		'hover:border-[color:var(--surface-border-hover)] hover:bg-[var(--surface-card-hover)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)]',
		'focus-visible:outline-[1.5px] focus-visible:outline-offset-1 focus-visible:outline-[color:var(--surface-accent)]',
		'active:cursor-grabbing'
	)}
	role="button"
	tabindex={tabIndex}
	data-board-card={key}
	aria-label={`${ref}: ${issue.title}`}
	onclick={activate}
	onkeydown={(e) => {
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			open();
		}
	}}
	onfocusin={() => setFocusedCard(key)}
	onfocusout={onFocusOut}
>
	<!-- Head: blocked marker only when flagged, reference, reserved tray gutter. -->
	<div class="flex min-w-0 items-center gap-2 pr-12">
		{#if issue.blocked}
			<BanIcon class="text-destructive size-3.5 shrink-0" role="img" aria-label="Blocked" />
		{/if}
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<span {...props} class="mono text-muted-foreground shrink-0 text-[11px]">
							{ref}
						</span>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{issue.repo}#{issue.number}</Tooltip.Content>
			</Tooltip.Root>
			{#if showRepo}
				<span class="text-muted-foreground/70 truncate text-[11px]">{shortRepo}</span>
			{/if}
		</div>
	</div>

	<div
		class="absolute top-1 right-1 flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100"
	>
		{#if canAssign}
			<button
				type="button"
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded outline-none focus-visible:ring-1"
				title="Assign to me"
				aria-label="Assign to me"
				onclick={() => void assignToMe(issue, viewer!)}
			>
				<UserPlusIcon class="size-3.5" />
			</button>
		{/if}
		<DropdownMenu.Root bind:open={menuOpen}>
			<DropdownMenu.Trigger
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded outline-none focus-visible:ring-1"
			>
				<EllipsisIcon class="size-3.5" />
				<span class="sr-only">Issue actions</span>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-52">
				<DropdownMenu.Label>Move to</DropdownMenu.Label>
				<DropdownMenu.RadioGroup
					value={stage}
					onValueChange={(value) => void moveToStatus(issue, value)}
				>
					{#each stageOptions as option (option.value)}
						<DropdownMenu.RadioItem value={option.value} class="gap-2">
							<StatusIcon status={option.value} />
							<span class="flex-1 truncate">{option.label}</span>
						</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>

				<DropdownMenu.Separator />
				<DropdownMenu.Item
					class="gap-2"
					onSelect={() => (issue.blocked ? requestUnblock(issue) : requestBlock(issue))}
				>
					<BanIcon class="text-destructive size-3.5" />
					{issue.blocked ? 'Unblock…' : 'Block…'}
				</DropdownMenu.Item>
				<DropdownMenu.Item
					class="gap-2"
					onSelect={() => (closed ? requestReopen(issue) : requestClose(issue))}
				>
					{#if closed}
						<RotateCcwIcon class="size-3.5" />
						Reopen issue
					{:else}
						<CircleCheckIcon class="size-3.5" />
						Close issue
					{/if}
				</DropdownMenu.Item>

				<DropdownMenu.Separator />
				<DropdownMenu.Item class="gap-2" onSelect={open}>
					<ExternalLinkIcon class="size-3.5" />
					Open details
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>

	<h3 class="mt-1.5 flex min-h-[2.7em] items-start gap-1 text-[13px] leading-[1.35] font-medium">
		<span class={cn('line-clamp-2 min-w-0', closed ? 'text-muted-foreground' : 'text-foreground')}>
			{issue.title}
		</span>
		{#if issue.labelConflict}
			<TriangleAlertIcon
				class="text-warning mt-0.5 size-3.5 shrink-0"
				title="Conflicting reserved labels on GitHub"
			/>
		{/if}
	</h3>

	<!-- Metadata grid: priority | size | labels | assignees. Fixed leading and
	     trailing columns keep those fields aligned down a lane; the optional
	     label track flexes between them instead of displacing size. -->
	<div class="mt-2 grid grid-cols-[32px_24px_minmax(0,1fr)_36px] items-center gap-1.5">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="focus-visible:ring-ring/50 inline-flex w-8 items-center justify-center rounded-[4px] outline-none focus-visible:ring-1"
				title={priorityTitle}
				aria-label="Priority"
			>
				{#if priorityLabel}
					<MetaTag label={priorityLabel} color={priorityColor} title={priorityTitle} />
				{:else}
					<span class="text-muted-foreground/50 text-[11px] leading-none">—</span>
				{/if}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-44">
				<DropdownMenu.Label>Priority</DropdownMenu.Label>
				<DropdownMenu.RadioGroup
					value={issue.priority ?? 'none'}
					onValueChange={(value) => void setPriority(issue, value === 'none' ? null : value)}
				>
					{#each priorityOptions as option (option.value)}
						<DropdownMenu.RadioItem value={option.value} class="gap-2">
							{#if option.value === 'none'}
								<SignalZeroIcon class="text-muted-foreground/60 size-3.5" />
							{:else}
								<PriorityIcon priority={option.value} />
							{/if}
							<span class="flex-1 truncate">{option.label}</span>
						</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<span class="flex items-center justify-center">
			{#if sizeText}
				<MetaTag label={sizeText} color={sizeColor} class="mono" title={`Size: ${issue.size}`} />
			{/if}
		</span>

		<span class="flex min-w-0 items-center gap-1 overflow-hidden">
			{#each visibleLabels as label (label)}
				<MetaTag label={label} />
			{/each}
			{#if extraLabels > 0}
				<span class="text-muted-foreground shrink-0 text-[11px]">+{extraLabels}</span>
			{/if}
		</span>

		<span class="flex items-center justify-end">
			{#if issue.assignees.length > 0}
				<div class="flex items-center -space-x-1.5">
					{#each issue.assignees.slice(0, 3) as person (person.githubId)}
						<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
					{/each}
				</div>
			{/if}
		</span>
	</div>
</div>
