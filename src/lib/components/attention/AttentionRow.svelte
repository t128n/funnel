<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import {
		Button,
		Dropdown,
		DropdownItem,
		DropdownMenu,
		DropdownToggle
	} from '@sveltestrap/sveltestrap';
	import RefText from '#lib/components/common/RefText.svelte';
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
			? 'Re-check overdue'
			: urgency === 'today'
				? 'Re-check today'
				: urgency === 'upcoming'
					? 'Re-check upcoming'
					: 'No re-check date'
	);
	const urgencyTone = $derived(
		urgency === 'overdue'
			? 'text-danger'
			: urgency === 'today'
				? 'text-warning-emphasis'
				: 'text-body-secondary'
	);
	const urgencyIcon = $derived(
		urgency === 'overdue'
			? 'bi-exclamation-triangle'
			: urgency === 'today'
				? 'bi-clock-history'
				: urgency === 'upcoming'
					? 'bi-calendar-event'
					: 'bi-calendar-x'
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
		'attention-action btn btn-link p-0 d-inline-flex align-items-center justify-content-center text-body-secondary text-decoration-none flex-shrink-0';

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
	<DropdownItem header>Re-check</DropdownItem>
	{#each quickDates as option (option.value)}
		<DropdownItem
			on:click={() => void snooze(option.value)}
			class="d-flex align-items-center justify-content-between gap-2"
		>
			<span class="text-truncate">{option.label}</span>
			<span class="font-monospace small text-body-tertiary">{option.value}</span>
		</DropdownItem>
	{/each}
	<DropdownItem on:click={() => requestBlock(issue)}>Custom date…</DropdownItem>
{/snippet}

<div
	role="listitem"
	class="attention-row position-relative d-flex align-items-center gap-3 border-bottom px-3 py-2"
>
	<!-- Stretched link: the whole row opens the issue; controls layer above it. -->
	<a
		{href}
		class="attention-row__link"
		aria-label={`Open ${issue.repo}#${issue.number}: ${issue.title}`}
	></a>

	<div class="d-flex min-w-0 flex-grow-1 flex-column gap-1 py-1">
		<div class="d-flex min-w-0 flex-wrap align-items-center gap-2">
			<span
				class="d-inline-flex align-items-center gap-1 small text-nowrap flex-shrink-0 {urgencyTone}"
				title={dateTitle}
			>
				<i class="bi {urgencyIcon}" aria-hidden="true"></i>
				<span>{urgencyLabel}</span>
			</span>

			{#if urgency !== 'unscheduled'}
				<time
					class="flex-shrink-0 small text-body-secondary tabular"
					datetime={item.recheck}
					title={dateTitle}
				>
					{recheckDateLabel(item.recheck)}
				</time>
			{/if}

			<span class="flex-shrink-0 link-primary"><RefText value={ref} title={`${issue.repo}#${issue.number}`} class="text-reset" /></span>

			<span class="min-w-0 flex-grow-1 text-truncate small text-body" title={issue.title}>
				{issue.title}
			</span>
		</div>

		<div class="d-flex min-w-0 align-items-center gap-2 small text-body-secondary">
			<span class="min-w-0 flex-grow-1 text-truncate" title={item.blocker}>
				{item.blocker || 'No blocker summary'}
			</span>
			<span class="flex-shrink-0 text-truncate" title={assigneeText}>
				{assigneeText || 'Unassigned'}
			</span>
		</div>
	</div>

	<div class="attention-controls position-relative z-1 d-flex flex-shrink-0 align-items-center gap-1">
		<!-- Desktop quick actions: hover/focus only; every one is also in the menu. -->
		<div class="attention-quick align-items-center gap-1">
			<Dropdown>
				<DropdownToggle
					color="link"
					caret={false}
					class={actionButton}
					title={urgency === 'unscheduled' ? 'Set re-check date' : 'Reschedule re-check'}
					aria-label={urgency === 'unscheduled' ? 'Set re-check date' : 'Reschedule re-check'}
				>
					<i class="bi bi-calendar-event fs-6" aria-hidden="true"></i>
				</DropdownToggle>
				<DropdownMenu end style="min-width: 13rem">
					{@render recheckItems()}
				</DropdownMenu>
			</Dropdown>

			{#if viewer}
				<Button
					color="link"
					class={actionButton}
					title={assignedToViewer ? 'Unassign me' : 'Assign to me'}
					aria-label={assignedToViewer ? 'Unassign me' : 'Assign to me'}
					onclick={toggleAssign}
				>
					<i
						class="bi {assignedToViewer ? 'bi-person-dash' : 'bi-person-plus'} fs-6"
						aria-hidden="true"
					></i>
				</Button>
			{/if}

			<Button
				color="link"
				class={actionButton}
				title="Mark done"
				aria-label="Mark done"
				onclick={() => requestClose(issue)}
			>
				<i class="bi bi-check-lg fs-6" aria-hidden="true"></i>
			</Button>
		</div>

		<!-- Always available: the same actions for touch and keyboard users. -->
		<Dropdown>
			<DropdownToggle
				color="link"
				caret={false}
				class={actionButton}
				title="Issue actions"
				aria-label="Issue actions"
			>
				<i class="bi bi-three-dots fs-6" aria-hidden="true"></i>
			</DropdownToggle>
			<DropdownMenu end style="min-width: 14rem">
				{@render recheckItems()}
				<DropdownItem divider />
				{#if viewer}
					<DropdownItem on:click={toggleAssign}>
						{assignedToViewer ? 'Unassign me' : 'Assign to me'}
					</DropdownItem>
				{/if}
				<DropdownItem on:click={() => requestClose(issue)}>Mark done</DropdownItem>
				<DropdownItem divider />
				<DropdownItem on:click={() => requestBlock(issue)}>Update block…</DropdownItem>
				<DropdownItem on:click={() => requestUnblock(issue)}>Unblock…</DropdownItem>
				<DropdownItem divider />
				<DropdownItem on:click={() => void goto(href)}>Open issue</DropdownItem>
			</DropdownMenu>
		</Dropdown>
	</div>
</div>

<style>
	.attention-row__link {
		position: absolute;
		inset: 0;
		outline: none;
	}

	.attention-row__link:focus-visible {
		outline: 2px solid var(--bs-primary);
		outline-offset: -2px;
	}

	.attention-controls :global(.attention-action) {
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--bs-border-radius-sm);
	}

	.attention-controls :global(.attention-action:hover) {
		background: var(--bs-tertiary-bg);
		color: var(--bs-body-color) !important;
	}

	.tabular {
		font-variant-numeric: tabular-nums;
	}

	.attention-quick {
		display: none;
	}

	@media (min-width: 768px) {
		.attention-quick {
			display: flex;
			opacity: 0;
			pointer-events: none;
		}

		.attention-row:hover .attention-quick,
		.attention-row:focus-within .attention-quick {
			opacity: 1;
			pointer-events: auto;
		}
	}
</style>
