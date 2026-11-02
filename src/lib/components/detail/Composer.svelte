<script lang="ts">
	import { onMount } from 'svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as InputGroup from '#lib/components/ui/input-group';
	import * as Kbd from '#lib/components/ui/kbd';
	import { cn } from '#lib/utils';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';

	/**
	 * The embedded action composer: a 3-row textarea with an attachment control,
	 * a Comment / Internal note segmented switch, a primary submit and a
	 * `⌘ Enter` hint. The parent owns which mutation `onsubmit` performs.
	 *
	 * ⌘/Ctrl+Enter submits. `value` is bindable so the parent owns the draft.
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

	let fileInput: HTMLInputElement | undefined = $state();
	let isMac = $state(true);

	onMount(() => {
		isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
	});

	const effectivePlaceholder = $derived(
		placeholder ?? (mode === 'note' ? 'Add an internal work note…' : 'Add a comment…')
	);
	const effectiveLabel = $derived(mode === 'note' ? 'Internal note' : label);
	const canSubmit = $derived(!disabled && !busy && value.trim().length > 0);

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			if (canSubmit) onsubmit();
		}
	}

	function onFiles(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		if (target.files && target.files.length > 0) onattach?.(Array.from(target.files));
		target.value = '';
	}
</script>

<InputGroup.Root class="border-border-strong bg-canvas">
	<InputGroup.Textarea
		class="min-h-24 resize-y px-3 py-2 text-body leading-body"
		placeholder={effectivePlaceholder}
		value={value}
		oninput={(event) => (value = event.currentTarget.value)}
		onkeydown={onKeydown}
		rows={3}
		aria-label={effectiveLabel}
	></InputGroup.Textarea>

	<InputGroup.Addon align="block-end" class="cursor-default justify-between gap-3 px-2 pt-1 pb-2">
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
				onclick={onsubmit}
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
