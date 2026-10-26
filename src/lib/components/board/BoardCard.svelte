<script module lang="ts">
	/**
	 * Compact text for a card's priority and size tokens: `P1 · S`, omitting
	 * whichever part is absent. Pure so it can be tested without mounting.
	 */
	export function cardToken(priority: string | null, size: string | null): string {
		const sizeLetter = size
			? (size.trim() === 'sm'
				? 'S'
				: size.trim() === 'md'
					? 'M'
					: size.trim() === 'lg'
						? 'L'
						: size.trim().toUpperCase())
			: null;
		return [priority?.trim() || null, sizeLetter].filter(Boolean).join(' · ');
	}
</script>

<script lang="ts">
	import * as DropdownMenu from '#lib/components/primitives/dropdown-menu/index.js';
	import * as Tooltip from '#lib/components/primitives/tooltip/index.js';
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
		requestUnblock
	} from '#lib/client/issue-actions.svelte';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { issueRef } from '#lib/issue-ref';
	import { canonicalLabel, STATUS_OPTIONS } from '#lib/labels';
	import { isRetiredPriorityLabel, priorityMeta } from '#lib/priority';
	import type { IssueListItem, UserRef } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import { cardData, draggableCard } from './dnd';
	import BanIcon from '@lucide/svelte/icons/ban';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

	/**
	 * One draggable board card in the Bugzilla idiom: a flat bordered article
	 * with a mono reference, a clamped title and a plain token row. There are no
	 * chips, glyphs or avatars — priority, size, labels and assignees read as
	 * text, the same way the issue list does. The column already carries the
	 * workflow status, so the card only marks a blocked issue.
	 *
	 * - **Head** — the blocked marker (when flagged) and the mono reference,
	 *   with a right gutter reserved for the hover tray.
	 * - **Title** — 13px, two lines; closed cards strike it through.
	 * - **Tokens** — `P1`–`P3`, size, comma-separated labels, assignee logins.
	 */
	interface Props {
		issue: IssueListItem;
		/** Lane this card currently belongs to; part of the drag payload. */
		columnKey: string;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes: Record<string, string>;
		/** Show the repository context tag when the board spans multiple repos. */
		showRepo?: boolean;
		/** Signed-in viewer, when their GitHub identity is mirrored. */
		viewer?: UserRef | null;
		/** Roving tab index owned by the board. */
		tabIndex?: number;
		/** Dim the card while it is the source of an active drag. */
		dragging?: boolean;
		/** RBAC `read`: cards cannot be picked up. */
		readonly?: boolean;
	}

	let {
		issue,
		columnKey,
		repoShortcodes,
		showRepo = false,
		viewer = null,
		tabIndex = -1,
		dragging = false,
		readonly = false
	}: Props = $props();

	const key = $derived(`${issue.repo}#${issue.number}`);
	/** Read-only boards never register a drag source. */
	const dragPayload = $derived(readonly ? null : cardData(key, columnKey));
	const ref = $derived(issueRef(issue.repo, issue.number, repoShortcodes));
	const closed = $derived(issue.state === 'closed');
	const shortRepo = $derived(issue.repo.split('/')[1] ?? issue.repo);

	/** Non-reserved labels only; reserved groups render as dedicated affordances. */
	const labels = $derived(
		issue.labels.filter(
			(label) => !canonicalLabel(label) && !isRetiredPriorityLabel(label)
		)
	);
	const labelText = $derived(labels.join(', '));

	const sizeText = $derived(
		issue.size === 'sm' ? 'S' : issue.size === 'md' ? 'M' : issue.size === 'lg' ? 'L' : null
	);

	/** Priority reads as text on a card: `P1`/`P2`/`P3`. */
	const priorityDisplay = $derived(priorityMeta(issue.priority));
	const priorityLabel = $derived(priorityDisplay?.value ?? null);
	const priorityTitle = $derived(
		priorityDisplay
			? `Priority ${priorityDisplay.value} · ${priorityDisplay.name}`
			: 'No priority'
	);
	const priorityClass = $derived(
		closed
			? 'flag-muted'
			: priorityLabel === 'P1'
				? 'flag-danger'
				: priorityLabel === 'P2'
					? 'flag-warning'
					: 'flag-muted'
	);

	const assigneeText = $derived(issue.assignees.map((person) => person.login).join(', '));

	const stage = $derived(closed ? 'done' : (issue.status ?? ''));
	const stageOptions = $derived([
		...STATUS_OPTIONS,
		{ value: 'done', label: 'Done', color: 'var(--syntax-constant)' }
	]);

	const canAssign = $derived(
		viewer != null && !issue.assignees.some((person) => person.externalId === viewer.externalId)
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

<!-- The card itself is the interactive open/drag target; `<article>` is required
     by the Bugzilla card layout, so the role is intentional. -->
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<article
	class={cn(
		'board-card group/card relative flex flex-col border-[color:var(--border)] bg-[var(--card)] p-2 transition-colors',
		'rounded-none shadow-none',
		'hover:border-[color:var(--muted-foreground)]',
		'focus-visible:outline-[1.5px] focus-visible:outline-offset-1 focus-visible:outline-[color:var(--primary)]',
		!readonly && 'cursor-grab active:cursor-grabbing',
		dragging && 'opacity-50'
	)}
	use:draggableCard={dragPayload}
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
	<!-- Head: blocked marker only when flagged, mono reference, reserved tray gutter. -->
	<div class="flex min-w-0 items-center gap-1.5 pr-12">
		{#if issue.blocked}
			<BanIcon class="text-destructive size-3.5 shrink-0" role="img" aria-label="Blocked" />
		{/if}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<span {...props} class="mono text-muted-foreground shrink-0 text-xs">
						{ref}
					</span>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{issue.repo}#{issue.number}</Tooltip.Content>
		</Tooltip.Root>
		{#if showRepo}
			<span class="text-muted-foreground truncate text-xs">{shortRepo}</span>
		{/if}
	</div>

	<div
		class="absolute top-1 right-1 flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100"
	>
		{#if canAssign}
			<button
				type="button"
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded-none outline-none focus-visible:ring-1"
				title="Assign to me"
				aria-label="Assign to me"
				onclick={() => void assignToMe(issue, viewer!)}
			>
				<UserPlusIcon class="size-3.5" />
			</button>
		{/if}
		<DropdownMenu.Root bind:open={menuOpen}>
			<DropdownMenu.Trigger
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded-none outline-none focus-visible:ring-1"
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
						<DropdownMenu.RadioItem value={option.value}>
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

	<h3 class="mt-1 flex items-start gap-1 text-sm leading-[1.35] font-medium">
		<span
			class={cn(
				'line-clamp-2 min-w-0 break-words',
				closed ? 'text-muted-foreground line-through' : 'text-foreground'
			)}
		>
			{issue.title}
		</span>
		{#if issue.labelConflict}
			<TriangleAlertIcon
				class="text-warning mt-0.5 size-3.5 shrink-0"
				title="Conflicting reserved label or retired priority label on GitHub"
			/>
		{/if}
	</h3>

	<!-- Token row: priority, size, labels, then assignee logins at the far right. -->
	<div class="mt-1.5 flex min-w-0 items-baseline gap-x-1.5">
		{#if priorityLabel}
			<span class={cn('flag shrink-0', priorityClass)} title={priorityTitle}>{priorityLabel}</span>
		{/if}
		{#if sizeText}
			<span class="flag flag-muted shrink-0" title={`Size: ${issue.size}`}>{sizeText}</span>
		{/if}
		{#if labelText}
			<span class="flag flag-muted min-w-0 truncate" title={labelText}>{labelText}</span>
		{/if}
		{#if assigneeText}
			<span
				class="ml-auto min-w-0 max-w-[45%] shrink-0 truncate text-right text-xs text-[color:var(--muted-foreground)]"
				title={assigneeText}
			>
				{assigneeText}
			</span>
		{/if}
	</div>
</article>
