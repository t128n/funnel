<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Button, ButtonGroup } from '@sveltestrap/sveltestrap';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import {
		activeMentionAt,
		applyMention,
		filterMentions,
		type ActiveMention,
		type MentionCandidate
	} from './mention';

	/**
	 * The embedded action composer: an ordinary Bootstrap textarea that starts
	 * as a one-line prompt and expands in place on focus (or whenever a draft
	 * exists) to show the attachment control, the Comment / Internal note
	 * switch, a primary submit and a `⌘ Enter` hint. The parent owns which
	 * mutation `onsubmit` performs.
	 *
	 * ⌘/Ctrl+Enter submits. `value` is bindable so the parent owns the draft,
	 * and the textarea is never unmounted, so collapsing never loses content,
	 * caret context or the selected channel.
	 */
	interface Props {
		value?: string;
		placeholder?: string;
		/** A submission is in flight. */
		busy?: boolean;
		disabled?: boolean;
		/** Accessible name for the field and the send action. */
		label?: string;
		/** Which channel the draft targets, when the toggle is shown. */
		mode?: 'comment' | 'note';
		/** Render the Comment / Internal note switch. */
		showModeToggle?: boolean;
		/** Enables the attach control; receives the picked files. */
		onattach?: (files: File[]) => void;
		/** People offered by `@login` autocomplete, normally the repo's assignees. */
		mentionOptions?: MentionCandidate[];
		onsubmit: () => void;
	}

	let {
		value = $bindable(''),
		placeholder,
		busy = false,
		disabled = false,
		label = 'Comment',
		mode = $bindable('comment'),
		showModeToggle = false,
		onattach,
		mentionOptions = [],
		onsubmit
	}: Props = $props();

	let root: HTMLDivElement | undefined = $state();
	let field: HTMLTextAreaElement | undefined = $state();
	let fileInput: HTMLInputElement | undefined = $state();
	/** The `@query` under the caret, or null when the menu is closed. */
	let activeMention = $state<ActiveMention | null>(null);
	/** Highlighted row in the mention menu. */
	let mentionIndex = $state(0);
	let isMac = $state(true);
	/** Focus/click opened the composer, independent of the draft. */
	let open = $state(false);
	/** Escape collapsed the composer without discarding the draft. */
	let collapsed = $state(false);

	onMount(() => {
		isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
	});

	const effectivePlaceholder = $derived(
		placeholder ?? (mode === 'note' ? 'Add an internal work note…' : 'Add a comment…')
	);
	const effectiveLabel = $derived(mode === 'note' ? 'Internal note' : label);
	const canSubmit = $derived(!disabled && !busy && value.trim().length > 0);
	/** A non-empty draft keeps the full composer visible, even after blur. */
	const hasDraft = $derived(value.trim().length > 0);
	const expanded = $derived(!collapsed && (open || hasDraft));
	const mentionMatches = $derived(
		activeMention === null ? [] : filterMentions(mentionOptions, activeMention.query)
	);
	const mentionOpen = $derived(expanded && activeMention !== null && mentionMatches.length > 0);

	/** Re-read the mention token from the textarea's caret. */
	function syncMention() {
		if (!field) {
			activeMention = null;
			return;
		}
		activeMention = activeMentionAt(field.value, field.selectionStart ?? field.value.length);
		mentionIndex = 0;
	}

	function chooseMention(login: string) {
		const mention = activeMention;
		if (!mention || !field) return;
		const caret = field.selectionStart ?? field.value.length;
		const applied = applyMention(value, caret, mention, login);
		value = applied.value;
		activeMention = null;
		mentionIndex = 0;
		void tick().then(() => {
			field?.focus();
			field?.setSelectionRange(applied.caret, applied.caret);
		});
	}

	function moveMention(delta: number) {
		const count = mentionMatches.length;
		if (count === 0) return;
		mentionIndex = (mentionIndex + delta + count) % count;
	}

	function onFocus() {
		collapsed = false;
		open = true;
		syncMention();
	}

	function onBlur(event: FocusEvent) {
		const next = event.relatedTarget;
		// Moving to Attach, the mode switch, the mention menu or Submit keeps the
		// composer open.
		if (next instanceof Node && root?.contains(next)) return;
		activeMention = null;
		if (!hasDraft) open = false;
	}

	function onInput(event: Event) {
		value = (event.currentTarget as HTMLTextAreaElement).value;
		collapsed = false;
		syncMention();
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			if (canSubmit) {
				open = false;
				activeMention = null;
				onsubmit();
			}
			return;
		}
		if (mentionOpen && activeMention !== null) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				moveMention(1);
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				moveMention(-1);
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				event.preventDefault();
				const chosen = mentionMatches[mentionIndex];
				if (chosen) chooseMention(chosen.login);
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				activeMention = null;
				return;
			}
		}
		// Escape returns to the compact prompt and keeps the draft intact.
		if (event.key === 'Escape') {
			event.preventDefault();
			collapsed = true;
			open = false;
			(event.currentTarget as HTMLTextAreaElement).blur();
		}
	}

	function submit() {
		if (!canSubmit) return;
		// The draft keeps the composer open on failure; on success the parent
		// clears `value`, which collapses it back to the prompt.
		open = false;
		activeMention = null;
		onsubmit();
	}

	function onFiles(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		if (target.files && target.files.length > 0) onattach?.(Array.from(target.files));
		target.value = '';
	}
</script>

<div bind:this={root} class="position-relative">
	{#if !expanded}
		<i class="bi bi-chat-left-text composer-prompt-icon" aria-hidden="true"></i>
	{/if}
	<textarea
		id="issue-composer"
		bind:this={field}
		class="form-control composer-input {expanded
			? 'composer-input--expanded'
			: 'composer-input--collapsed'}"
		placeholder={effectivePlaceholder}
		{value}
		oninput={onInput}
		onfocus={onFocus}
		onblur={onBlur}
		onkeydown={onKeydown}
		rows={expanded ? 3 : 1}
		aria-label={effectiveLabel}
		aria-autocomplete="list"
		aria-controls={mentionOpen ? 'issue-composer-mentions' : undefined}
		aria-activedescendant={mentionOpen
			? `issue-composer-mention-${mentionMatches[mentionIndex]?.login ?? ''}`
			: undefined}
	></textarea>

	{#if mentionOpen}
		<div
			id="issue-composer-mentions"
			class="mention-menu dropdown-menu show"
			role="listbox"
			aria-label="Mention a person"
		>
			{#each mentionMatches as person, index (person.login)}
				<button
					id={`issue-composer-mention-${person.login}`}
					type="button"
					class="mention-option dropdown-item d-flex align-items-center gap-2"
					class:active={index === mentionIndex}
					role="option"
					aria-selected={index === mentionIndex}
					onmousedown={(event) => event.preventDefault()}
					onclick={() => chooseMention(person.login)}
				>
					<i class="bi bi-person-circle" aria-hidden="true"></i>
					<span class="font-monospace">@{person.login}</span>
				</button>
			{/each}
		</div>
	{/if}

	<div
		class="composer-actions d-flex min-w-0 flex-wrap align-items-center justify-content-between gap-2 mt-2 {expanded
			? ''
			: 'd-none'}"
	>
		<div class="d-flex min-w-0 align-items-center gap-2">
			<Button
				color="link"
				size="sm"
				class="d-inline-flex align-items-center gap-1 text-decoration-none px-1 py-0 text-body-secondary"
				disabled={!onattach}
				title={onattach ? 'Attach files' : 'Attachments are unavailable'}
				tabindex={onattach ? undefined : -1}
				onclick={() => fileInput?.click()}
			>
				<i class="bi bi-paperclip flex-shrink-0" aria-hidden="true"></i>
				Attach
			</Button>
			{#if onattach}
				<input
					bind:this={fileInput}
					type="file"
					multiple
					class="d-none"
					onchange={onFiles}
					aria-hidden="true"
					tabindex={-1}
				/>
			{/if}
			<span class="small text-body-secondary">Markdown supported</span>
		</div>
		<div class="d-flex min-w-0 flex-wrap align-items-center justify-content-end gap-2">
			{#if showModeToggle}
				<ButtonGroup size="sm" role="group" aria-label="Submission channel">
					<Button
						color="outline-secondary"
						active={mode === 'comment'}
						aria-pressed={mode === 'comment'}
						onclick={() => (mode = 'comment')}
					>
						Comment
					</Button>
					<Button
						color="outline-secondary"
						active={mode === 'note'}
						aria-pressed={mode === 'note'}
						onclick={() => (mode = 'note')}
					>
						Internal note
					</Button>
				</ButtonGroup>
			{/if}
			<kbd class="composer-kbd border px-1 d-none d-sm-inline-flex" aria-hidden="true">
				{isMac ? '⌘' : 'Ctrl'}&nbsp;Enter
			</kbd>
			<Button
				color="primary"
				size="sm"
				onclick={submit}
				disabled={!canSubmit}
				title={effectiveLabel}
				aria-label={effectiveLabel}
			>
				{#if busy}
					<Spinner size={13} class="me-1" />
				{/if}
				{busy ? (mode === 'note' ? 'Saving…' : 'Posting…') : mode === 'note' ? 'Add note' : 'Comment'}
			</Button>
		</div>
	</div>
</div>

<style>
	/*
	 * Bootstrap's default <kbd> is light text on the body colour. The old
	 * `text-body-secondary` override painted dark text over that dark fill in
	 * light mode, leaving the shortcut invisible. Use the muted surface chip
	 * in both themes instead.
	 */
	.composer-kbd {
		background: var(--bs-tertiary-bg);
		color: var(--bs-secondary-color);
		font-family: var(--bs-font-monospace);
		font-size: 0.75rem;
		font-weight: 400;
	}

	.composer-prompt-icon {
		position: absolute;
		top: 50%;
		left: 0.75rem;
		color: var(--bs-secondary-color);
		pointer-events: none;
		transform: translateY(-50%);
	}

	.composer-input--collapsed {
		height: 2.5rem;
		min-height: 2.5rem;
		padding-left: 2.25rem;
		resize: none;
	}

	.composer-input--expanded {
		min-height: 6rem;
		resize: vertical;
	}

	.mention-menu {
		z-index: 1040;
		max-height: 14rem;
		overflow-y: auto;
	}

	.mention-option {
		gap: 0.5rem;
	}

	.mention-option.active {
		color: var(--bs-dropdown-link-active-color);
		background-color: var(--bs-dropdown-link-active-bg);
	}
</style>
