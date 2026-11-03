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
	import {
		Button,
		Dropdown,
		DropdownItem,
		DropdownMenu,
		DropdownToggle
	} from '@sveltestrap/sveltestrap';
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
	import { cardData, draggableCard } from './dnd';

	/**
	 * One draggable board card: a plain bordered item with stock Bootstrap
	 * spacing and no shadow. The column already carries the workflow status, so
	 * the card only marks a blocked issue (icon + word).
	 *
	 * - **Head** — mono reference and the always available actions menu.
	 * - **Title** — 0.875 rem, normal weight, clamped to two lines; the full
	 *   title stays available on hover and through the card's accessible name.
	 * - **Metadata** — 12px priority and size, with the assignee trailing.
	 */
	interface Props {
		issue: IssueListItem;
		/** Lane this card currently belongs to; part of the drag payload. */
		columnKey: string;
		/** `owner/name` → project key from instance settings. */
		repoShortcodes: Record<string, string>;
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
		{ value: 'done', label: 'Done' }
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
	class="board-card position-relative d-flex flex-column gap-1 rounded border bg-body px-2 py-2"
	class:board-card--draggable={!readonly}
	class:opacity-50={dragging}
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
	<div class="d-flex min-w-0 align-items-center gap-1">
		<span class="d-inline-flex min-w-0 flex-shrink-0 link-primary">
			<RefText value={ref} title={`${issue.repo}#${issue.number}`} class="text-reset" />
		</span>

		<Dropdown bind:isOpen={menuOpen}>
			<DropdownToggle
				color="link"
				size="sm"
				caret={false}
				class="ms-auto flex-shrink-0 text-body-secondary text-decoration-none px-1"
				aria-label="Issue actions"
				title="Issue actions"
			>
				<i class="bi bi-three-dots" aria-hidden="true"></i>
			</DropdownToggle>
			<DropdownMenu class="board-card-menu">
				<DropdownItem header>Move to…</DropdownItem>
				{#each stageOptions as option (option.value)}
					<DropdownItem
						active={stage === option.value}
						on:click={() => void moveToStatus(issue, option.value)}
					>
						<i
							class="bi {stage === option.value ? 'bi-check-lg' : 'bi-circle'} me-2 small"
							aria-hidden="true"
						></i>
						<span class="text-truncate">{option.label}</span>
					</DropdownItem>
				{/each}

				<DropdownItem divider />
				{#if canAssign}
					<DropdownItem on:click={() => void assignToMe(issue, viewer!)}>
						<i class="bi bi-person-plus me-2" aria-hidden="true"></i>
						Assign to me
					</DropdownItem>
				{/if}
				<DropdownItem
					on:click={() => (issue.blocked ? requestUnblock(issue) : requestBlock(issue))}
				>
					<i class="bi bi-slash-circle text-danger me-2" aria-hidden="true"></i>
					{issue.blocked ? 'Unblock…' : 'Block…'}
				</DropdownItem>
				<DropdownItem
					on:click={() => (closed ? requestReopen(issue) : requestClose(issue))}
				>
					{#if closed}
						<i class="bi bi-arrow-counterclockwise me-2" aria-hidden="true"></i>
						Reopen issue
					{:else}
						<i class="bi bi-check-circle me-2" aria-hidden="true"></i>
						Close issue
					{/if}
				</DropdownItem>

				<DropdownItem divider />
				<DropdownItem on:click={open}>
					<i class="bi bi-box-arrow-up-right me-2" aria-hidden="true"></i>
					Open details
				</DropdownItem>
			</DropdownMenu>
		</Dropdown>
	</div>

	<h3 class="d-flex align-items-start gap-1 small lh-sm mb-0">
		<span class="board-card-title min-w-0 text-body" title={issue.title}>
			{issue.title}
		</span>
		{#if issue.labelConflict}
			<i
				class="bi bi-exclamation-triangle mt-1 flex-shrink-0 text-warning"
				aria-hidden="true"
			></i>
			<span class="visually-hidden"
				>Conflicting reserved label or retired priority label on GitHub</span
			>
		{/if}
	</h3>

	{#if hasMetadata}
		<div class="board-card-meta d-flex min-w-0 align-items-baseline gap-2 text-body-secondary">
			{#if issue.blocked}
				<StatusText blocked class="flex-shrink-0" />
			{/if}
			{#if issue.priority}
				<PriorityText priority={issue.priority} class="flex-shrink-0" />
			{/if}
			{#if sizeText}
				<span class="flex-shrink-0" title={`Size: ${issue.size}`}>{sizeText}</span>
			{/if}
			{#if assigneeText}
				<span
					class="ms-auto min-w-0 text-truncate text-end board-card-assignee"
					title={assigneeText}
				>
					{assigneeText}
				</span>
			{/if}
		</div>
	{/if}
</article>

<style>
	.board-card {
		transition: border-color 120ms ease-in-out;
	}

	.board-card:hover {
		border-color: var(--bs-secondary-color);
	}

	.board-card--draggable {
		cursor: grab;
	}

	.board-card--draggable:active {
		cursor: grabbing;
	}

	.board-card-meta {
		font-size: 0.75rem;
	}

	.board-card-title {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow-wrap: anywhere;
	}

	.board-card-assignee {
		max-width: 45%;
	}

	:global(.board-card-menu) {
		min-width: 14rem;
	}
</style>
