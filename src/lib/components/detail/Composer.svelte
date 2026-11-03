<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, ButtonGroup } from '@sveltestrap/sveltestrap';
	import Spinner from '#lib/components/common/Spinner.svelte';

	/**
	 * The embedded action composer: a one-line prompt at rest that expands in
	 * place on focus (or whenever a draft exists) to show the attachment
	 * control, the Comment / Internal note switch, a primary submit and a
	 * `⌘ Enter` hint. The parent owns which mutation `onsubmit` performs.
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
		onsubmit
	}: Props = $props();

	let root: HTMLDivElement | undefined = $state();
	let fileInput: HTMLInputElement | undefined = $state();
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

	function onFocus() {
		collapsed = false;
		open = true;
	}

	function onBlur(event: FocusEvent) {
		const next = event.relatedTarget;
		// Moving to Attach, the mode switch or Submit keeps the composer open.
		if (next instanceof Node && root?.contains(next)) return;
		if (!hasDraft) open = false;
	}

	function onInput(event: Event) {
		value = (event.currentTarget as HTMLTextAreaElement).value;
		collapsed = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			if (canSubmit) {
				open = false;
				onsubmit();
			}
			return;
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
		onsubmit();
	}

	function onFiles(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		if (target.files && target.files.length > 0) onattach?.(Array.from(target.files));
		target.value = '';
	}
</script>

<div bind:this={root} class="position-relative">
	<div class="composer">
		{#if !expanded}
			<i class="bi bi-chat-left-text composer-prompt-icon" aria-hidden="true"></i>
		{/if}
		<textarea
			id="issue-composer"
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
		></textarea>

		<div
			class="composer-actions d-flex min-w-0 flex-wrap align-items-center justify-content-between gap-2 px-2 pt-1 pb-2 {expanded
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
				<kbd class="border px-1 d-none d-sm-inline-flex" aria-hidden="true">
					{isMac ? '⌘' : 'Ctrl'}&nbsp;Enter
				</kbd>
				<Button
					color="primary"
					size="sm"
					style="min-width: 5rem"
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
</div>

<style>
	.composer {
		position: relative;
		overflow: hidden;
		border: 1px solid var(--bs-border-color);
		border-radius: var(--bs-border-radius);
		background: var(--bs-body-bg);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.composer:focus-within {
		border-color: var(--bs-primary);
		box-shadow: 0 0 0 0.2rem rgba(var(--bs-primary-rgb), 0.2);
	}

	.composer-prompt-icon {
		position: absolute;
		top: 50%;
		left: 0.75rem;
		color: var(--bs-secondary-color);
		pointer-events: none;
		transform: translateY(-50%);
	}

	.composer-input {
		border: 0;
		background: transparent;
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.composer-input:focus {
		background: transparent;
		box-shadow: none;
	}

	.composer-input--collapsed {
		height: 2.5rem;
		min-height: 2.5rem;
		padding: 0.5rem 0.75rem 0.5rem 2.25rem;
		resize: none;
	}

	.composer-input--expanded {
		min-height: 6rem;
		padding: 0.75rem;
		resize: vertical;
	}
</style>
