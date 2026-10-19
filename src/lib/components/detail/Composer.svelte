<script lang="ts">
	import { onMount } from 'svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as InputGroup from '#lib/components/ui/input-group';
	import * as Kbd from '#lib/components/ui/kbd';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';

	/**
	 * The embedded action composer: a bordered container holding an auto-growing
	 * textarea with its submit and attachment affordances nested in the bottom
	 * row, instead of a bare full-width textarea beside a stray button.
	 *
	 * With `showModeToggle` it doubles as the issue's Comment / Work note
	 * switch; the parent owns which mutation `onsubmit` performs. `onattach`
	 * enables the paperclip (files are handed back to the parent to upload).
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
		/** Render the Comment / Work note switch. */
		showModeToggle?: boolean;
		/** Enables the paperclip; receives the picked files. */
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
	const effectiveLabel = $derived(mode === 'note' ? 'Work note' : label);
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

<InputGroup.Root
	class="surface-shell h-auto flex-col rounded-lg border-[color:var(--surface-border)] bg-[var(--surface-tag-bg)] dark:bg-[var(--surface-tag-bg)] transition-[border-color,background-color] duration-150 ease-out hover:border-[color:var(--surface-border-hover)] has-[[data-slot=input-group-control]:focus-visible]:border-[color:var(--surface-border-hover)] has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot=input-group-control]:focus-visible]:outline has-[[data-slot=input-group-control]:focus-visible]:outline-[1.5px] has-[[data-slot=input-group-control]:focus-visible]:outline-offset-2 has-[[data-slot=input-group-control]:focus-visible]:outline-[color:var(--surface-accent)]"
>
	<InputGroup.Textarea
		class="min-h-16 px-3 py-2.5 text-[13px] leading-relaxed dark:text-[#d4d6db]"
		placeholder={effectivePlaceholder}
		value={value}
		oninput={(event) => (value = event.currentTarget.value)}
		onkeydown={onKeydown}
		rows={2}
		aria-label={effectiveLabel}
	></InputGroup.Textarea>

	<InputGroup.Addon align="block-end" class="cursor-default justify-between gap-1 px-2 pt-1 pb-2">
		<div class="flex items-center gap-1">
			<Button
				variant="ghost"
				size="icon-sm"
				class="transition-[transform,background-color] duration-150 ease-out active:scale-[0.96]"
				disabled={!onattach}
				title={onattach ? 'Attach files' : 'Attachments coming soon'}
				aria-label="Attach files"
				tabindex={onattach ? undefined : -1}
				onclick={() => fileInput?.click()}
			>
				<PaperclipIcon />
			</Button>
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
		<div class="flex items-center gap-2">
			{#if showModeToggle}
				<ToggleGroup.Root
					type="single"
					size="sm"
					variant="outline"
					value={mode}
					onValueChange={(next) => {
						if (next === 'comment' || next === 'note') mode = next;
					}}
					aria-label="Submission channel"
				>
					<ToggleGroup.Item value="comment">Comment</ToggleGroup.Item>
					<ToggleGroup.Item value="note">Note</ToggleGroup.Item>
				</ToggleGroup.Root>
			{:else}
				<Kbd.Root
					class="text-muted-foreground hidden h-auto min-w-0 rounded-none bg-transparent px-0 font-sans text-[11px] font-normal sm:inline-flex"
					aria-hidden="true"
				>
					{isMac ? '⌘' : 'Ctrl'}↵
				</Kbd.Root>
			{/if}
			<Button
				variant={canSubmit ? 'default' : 'ghost'}
				size="icon-sm"
				class="transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96]"
				onclick={onsubmit}
				disabled={!canSubmit}
				title={effectiveLabel}
				aria-label={effectiveLabel}
			>
				{#if busy}
					<Spinner size={13} />
				{:else}
					<ArrowUpIcon />
				{/if}
			</Button>
		</div>
	</InputGroup.Addon>
</InputGroup.Root>
