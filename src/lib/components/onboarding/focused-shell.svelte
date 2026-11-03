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

<main class="min-vh-100 bg-body px-3 py-4 py-sm-5">
	<div class="form-measure mx-auto d-flex w-100 flex-column gap-4">
		<header class="d-flex align-items-baseline gap-3">
			<a href="/" class="align-self-start fw-semibold text-body text-decoration-none" translate="no"
				>funnel</a
			>
			{#if caption}
				<span class="small text-body-secondary">{caption}</span>
			{/if}
		</header>

		{@render children()}
	</div>
</main>
