<script lang="ts">
	import { formatForDisplay, getHotkeyHint } from '@tanstack/svelte-hotkeys';
	import type { AppHotkey } from '@tanstack/hotkeys';
	import { Kbd } from '#lib/components/primitives/kbd';
	import { cn } from '#lib/utils.js';

	let {
		hotkey,
		class: className
	}: {
		/** The catalog entry whose binding should be revealed. */
		hotkey: AppHotkey;
		class?: string;
	} = $props();

	// `visible` is true only while the user holds one of the hotkey's modifiers,
	// so the hint stays out of the way until they reach for the keyboard. A
	// binding without modifiers (e.g. the bare `C`) never reveals a hint.
	const hint = getHotkeyHint(() => hotkey);
</script>

{#if hint.visible && hotkey.hotkey}
	<Kbd class={cn('h-5', className)}>
		{formatForDisplay(hotkey.hotkey)}
	</Kbd>
{/if}
