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
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { Button } from '#lib/components/ui/button';
	import PriorityText from '#lib/components/common/PriorityText.svelte';
	import RefText from '#lib/components/common/RefText.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
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
	import { STATUS_OPTIONS } from '#lib/labels';
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
	 * One draggable board card in the t128n idiom: a canvas article with a 1px
	 * subtle rule and no shadow. The column already carries the workflow status,
	 * so the card only marks a blocked issue (icon + word).
	 *
	 * - **Head** — mono reference and the always available actions menu.
	 * - **Title** — 0.875 rem / 600, clamped to two lines; the full title stays
	 *   available on hover and through the card's accessible name.
	 * - **Metadata** — priority and size, with the assignee trailing.
	 */
	interface Props {
		issue: IssueListItem;
		/** Lane this card currently belongs to; part of the drag payload. */
		columnKey: string;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes: Record<string, string>;
		/** Signed-in viewer, when their GitHub identity is mirrored. */
		viewer?: UserRef | null;
		/** The docked detail's issue; draws a 2px primary leading bar. */
		selected?: boolean;
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
		viewer = null,
		selected = false,
		tabIndex = -1,
		dragging = false,
		readonly = false
	}: Props = $props();

	const key = $derived(`${issue.repo}#${issue.number}`);
	/** Read-only boards never register a drag source. */
	const dragPayload = $derived(readonly ? null : cardData(key, columnKey));
	const ref = $derived(issueRef(issue.repo, issue.number, repoShortcodes));
	const closed = $derived(issue.state === 'closed');

	const sizeText = $derived(
		issue.size === 'sm' ? 'S' : issue.size === 'md' ? 'M' : issue.size === 'lg' ? 'L' : null
	);

	const assigneeText = $derived(issue.assignees.map((person) => person.login).join(', '));
	const hasMetadata = $derived(
		issue.blocked ||
			Boolean(issue.priority) ||
			Boolean(sizeText) ||
			Boolean(assigneeText)
	);

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

<!-- The card itself is the interactive open/drag target; `<article>` is the
     card container, so the role is intentional. Actions stay in the menu (never
     hover-only) so every drag has a keyboard- and touch-reachable equivalent. -->
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<article
	class={cn(
		'board-card group/card relative flex flex-col gap-1 rounded-md border border-border-subtle bg-canvas px-3 py-3',
		'hover:border-border-strong',
		!readonly && 'cursor-grab active:cursor-grabbing',
		selected && 'is-selected-row',
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
	<!-- Head: mono reference, always-visible menu. -->
	<div class="flex min-w-0 items-center gap-1.5">
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<span {...props} class="inline-flex min-w-0 shrink-0">
						<RefText value={ref} title={`${issue.repo}#${issue.number}`} />
					</span>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{issue.repo}#{issue.number}</Tooltip.Content>
		</Tooltip.Root>

		<DropdownMenu.Root bind:open={menuOpen}>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						variant="ghost"
						size="icon-sm"
						class="ml-auto shrink-0 text-fg-secondary"
						aria-label="Issue actions"
						{...props}
					>
						<EllipsisIcon />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-56">
				<DropdownMenu.Label>Move to…</DropdownMenu.Label>
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
				{#if canAssign}
					<DropdownMenu.Item class="gap-2" onSelect={() => void assignToMe(issue, viewer!)}>
						<UserPlusIcon class="size-4" />
						Assign to me
					</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Item
					class="gap-2"
					onSelect={() => (issue.blocked ? requestUnblock(issue) : requestBlock(issue))}
				>
					<BanIcon class="text-error size-4" />
					{issue.blocked ? 'Unblock…' : 'Block…'}
				</DropdownMenu.Item>
				<DropdownMenu.Item
					class="gap-2"
					onSelect={() => (closed ? requestReopen(issue) : requestClose(issue))}
				>
					{#if closed}
						<RotateCcwIcon class="size-4" />
						Reopen issue
					{:else}
						<CircleCheckIcon class="size-4" />
						Close issue
					{/if}
				</DropdownMenu.Item>

				<DropdownMenu.Separator />
				<DropdownMenu.Item class="gap-2" onSelect={open}>
					<ExternalLinkIcon class="size-4" />
					Open details
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>

	<h3 class="flex items-start gap-1 text-body leading-[1.35] font-semibold">
		<span class="line-clamp-2 min-w-0 break-words text-fg" title={issue.title}>
			{issue.title}
		</span>
		{#if issue.labelConflict}
			<TriangleAlertIcon class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
			<span class="sr-only">Conflicting reserved label or retired priority label on GitHub</span>
		{/if}
	</h3>

	{#if hasMetadata}
		<div class="flex min-w-0 items-baseline gap-x-2 text-caption text-fg-secondary">
			{#if issue.blocked}
				<StatusText blocked class="shrink-0" />
			{/if}
			{#if issue.priority}
				<PriorityText priority={issue.priority} class="shrink-0" />
			{/if}
			{#if sizeText}
				<span class="shrink-0" title={`Size: ${issue.size}`}>{sizeText}</span>
			{/if}
			{#if assigneeText}
				<span class="ml-auto min-w-0 max-w-[45%] truncate text-right" title={assigneeText}>
					{assigneeText}
				</span>
			{/if}
		</div>
	{/if}
</article>
