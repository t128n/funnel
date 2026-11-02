<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Focused flow shell: no app bar or navigation, one 40 rem column, and the
	 * wordmark at the top. Used by intake, login, onboarding, and error pages so
	 * the public routes share the same frame.
	 */
	interface Props {
		children: Snippet;
		/** Optional caption under the wordmark, e.g. the current step. */
		caption?: string;
	}

	let { children, caption }: Props = $props();
</script>

<main class="min-h-svh bg-canvas px-[var(--layout-page-padding)] py-8 sm:py-12">
	<div class="mx-auto flex w-full max-w-[var(--layout-form-max)] flex-col gap-8">
		<header class="flex items-baseline gap-3">
			<a href="/" class="w-fit text-body font-semibold text-fg" translate="no">funnel</a>
			{#if caption}
				<span class="text-caption text-fg-secondary">{caption}</span>
			{/if}
		</header>

		{@render children()}
	</div>
</main>
