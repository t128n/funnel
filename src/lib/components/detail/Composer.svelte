<script lang="ts">
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { Button } from '#lib/components/ui/button';
	import { Textarea } from '#lib/components/ui/textarea';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';

	/**
	 * The embedded action composer: a bordered container holding an auto-growing
	 * textarea with its submit and attachment affordances nested in the bottom
	 * row, instead of a bare full-width textarea beside a stray button.
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
		onsubmit: () => void;
	}

	let {
		value = $bindable(''),
		placeholder = 'Add a comment…',
		busy = false,
		disabled = false,
		label = 'Comment',
		onsubmit
	}: Props = $props();

	const canSubmit = $derived(!disabled && !busy && value.trim().length > 0);

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			if (canSubmit) onsubmit();
		}
	}
</script>

<div
	class="border-border bg-background focus-within:border-ring focus-within:ring-ring/50 flex flex-col border transition-colors focus-within:ring-1"
>
	<Textarea
		class="min-h-16 resize-none border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
		{placeholder}
		value={value}
		oninput={(event) => (value = event.currentTarget.value)}
		onkeydown={onKeydown}
		rows={2}
		aria-label={label}
	></Textarea>
	<div class="flex items-center justify-between gap-1 px-2 pb-2">
		<Button
			variant="ghost"
			size="icon-sm"
			disabled
			title="Attachments coming soon"
			aria-label="Attach files"
			tabindex={-1}
		>
			<PaperclipIcon />
		</Button>
		<div class="flex items-center gap-2">
			<span class="text-muted-foreground hidden text-xs sm:inline">⌘↵</span>
			<Button
				size="icon-sm"
				onclick={onsubmit}
				disabled={!canSubmit}
				title={label}
				aria-label={label}
			>
				{#if busy}
					<Spinner size={13} />
				{:else}
					<ArrowUpIcon />
				{/if}
			</Button>
		</div>
	</div>
</div>
