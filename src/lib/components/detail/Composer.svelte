<script lang="ts">
	import { onMount } from 'svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as InputGroup from '#lib/components/ui/input-group';
	import * as Kbd from '#lib/components/ui/kbd';
	import { cn } from '#lib/utils';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';

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

<div bind:this={root} class="relative">
	<InputGroup.Root class="border-border-strong bg-canvas">
		{#if !expanded}
			<MessageSquareIcon
				class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
				aria-hidden="true"
			/>
		{/if}
		<InputGroup.Textarea
			class={cn(
				'text-body leading-body',
				expanded
					? 'min-h-24 resize-y px-3 py-3'
					: 'h-(--size-control-comfortable) min-h-(--size-control-comfortable) resize-none py-2.5 pr-3 pl-9'
			)}
			placeholder={effectivePlaceholder}
			value={value}
			oninput={onInput}
			onfocus={onFocus}
			onblur={onBlur}
			onkeydown={onKeydown}
			rows={expanded ? 3 : 1}
			aria-label={effectiveLabel}
		></InputGroup.Textarea>

		<InputGroup.Addon
			align="block-end"
			class={cn('cursor-default justify-between gap-3 px-3 pt-1 pb-3', !expanded && 'hidden')}
		>
			<div class="flex min-w-0 items-center gap-2">
				<button
					type="button"
					class="inline-flex h-(--size-control-sm) items-center gap-1.5 rounded-sm px-2 text-caption text-fg-secondary hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:text-fg-disabled"
					disabled={!onattach}
					title={onattach ? 'Attach files' : 'Attachments are unavailable'}
					tabindex={onattach ? undefined : -1}
					onclick={() => fileInput?.click()}
				>
					<PaperclipIcon class="size-4 shrink-0" aria-hidden="true" />
					Attach
				</button>
				{#if onattach}
					<input
						bind:this={fileInput}
						type="file"
						multiple
						class="hidden"
						onchange={onFiles}
						aria-hidden="true"
						tabindex={-1}
					/>
				{/if}
			</div>
			<div class="flex min-w-0 flex-wrap items-center justify-end gap-2">
				{#if showModeToggle}
					<div
						class="inline-flex overflow-hidden rounded-sm border border-border-strong"
						role="group"
						aria-label="Submission channel"
					>
						<button
							type="button"
							class={cn(
								'inline-flex h-(--size-control-sm) items-center px-2 text-caption',
								mode === 'comment'
									? 'bg-surface-2 font-semibold text-fg'
									: 'text-fg-secondary hover:bg-surface hover:text-fg'
							)}
							aria-pressed={mode === 'comment'}
							onclick={() => (mode = 'comment')}
						>
							Comment
						</button>
						<button
							type="button"
							class={cn(
								'inline-flex h-(--size-control-sm) items-center border-l border-border-subtle px-2 text-caption',
								mode === 'note'
									? 'bg-surface-2 font-semibold text-fg'
									: 'text-fg-secondary hover:bg-surface hover:text-fg'
							)}
							aria-pressed={mode === 'note'}
							onclick={() => (mode = 'note')}
						>
							Internal note
						</button>
					</div>
				{/if}
				<Kbd.Root class="hidden sm:inline-flex" aria-hidden="true">
					{isMac ? '⌘' : 'Ctrl'}&nbsp;Enter
				</Kbd.Root>
				<Button
					size="sm"
					class="min-w-20"
					onclick={submit}
					disabled={!canSubmit}
					title={effectiveLabel}
					aria-label={effectiveLabel}
				>
					{#if busy}
						<Spinner size={13} />
					{/if}
					{busy ? (mode === 'note' ? 'Saving…' : 'Posting…') : mode === 'note' ? 'Add note' : 'Comment'}
				</Button>
			</div>
		</InputGroup.Addon>
	</InputGroup.Root>
</div>
