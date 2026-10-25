<script lang="ts">
	import { onMount } from 'svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as InputGroup from '#lib/components/ui/input-group';
	import * as Kbd from '#lib/components/ui/kbd';

	/**
	 * The embedded action composer: a plain bordered textarea with text-link
	 * submit, attachment and channel affordances in the bottom row.
	 *
	 * With `showModeToggle` it doubles as the issue's Comment / Work note
	 * switch; the parent owns which mutation `onsubmit` performs. `onattach`
	 * enables the attach link (files are handed back to the parent to upload).
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
		/** Enables the attach link; receives the picked files. */
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
	class="border-border bg-background hover:border-input has-[[data-slot=input-group-control]:focus-visible]:border-primary h-auto flex-col rounded-none border transition-colors duration-150 ease-out has-[[data-slot=input-group-control]:focus-visible]:ring-0"
>
	<InputGroup.Textarea
		class="min-h-16 px-3 py-2.5 text-[13px] leading-relaxed"
		placeholder={effectivePlaceholder}
		value={value}
		oninput={(event) => (value = event.currentTarget.value)}
		onkeydown={onKeydown}
		rows={2}
		aria-label={effectiveLabel}
	></InputGroup.Textarea>

	<InputGroup.Addon align="block-end" class="cursor-default justify-between gap-3 px-2 pt-1 pb-2">
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="link text-xs disabled:pointer-events-none disabled:opacity-50 disabled:no-underline"
				disabled={!onattach}
				title={onattach ? 'Attach file' : 'Attachments coming soon'}
				tabindex={onattach ? undefined : -1}
				onclick={() => fileInput?.click()}
			>
				Attach file
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
		<div class="flex items-center gap-3">
			{#if showModeToggle}
				<div class="flex items-center gap-2" role="group" aria-label="Submission channel">
					<button
						type="button"
						class="flag"
						class:font-semibold={mode === 'comment'}
						class:flag-muted={mode !== 'comment'}
						aria-pressed={mode === 'comment'}
						onclick={() => (mode = 'comment')}
					>
						Comment
					</button>
					<button
						type="button"
						class="flag"
						class:font-semibold={mode === 'note'}
						class:flag-muted={mode !== 'note'}
						aria-pressed={mode === 'note'}
						onclick={() => (mode = 'note')}
					>
						Note
					</button>
				</div>
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
				size="sm"
				class="rounded-none"
				onclick={onsubmit}
				disabled={!canSubmit}
				title={effectiveLabel}
				aria-label={effectiveLabel}
			>
				{#if busy}
					<Spinner size={13} />
				{/if}
				Save Changes
			</Button>
		</div>
	</InputGroup.Addon>
</InputGroup.Root>
