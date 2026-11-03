<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Button } from '@sveltestrap/sveltestrap';
	import { useHighlightedCode } from '#lib/hooks/use-highlighted-code.svelte';

	/**
	 * Prose code block for rendered Markdown. The server emits plain sanitized
	 * `pre > code` (highlighted with lowlight); `#lib/client/code-blocks` mounts
	 * this Svelte Code Block in its place and re-highlights it with Shiki.
	 */
	interface Props {
		code: string;
		language?: string | null;
	}

	let { code, language = null }: Props = $props();

	const label = $derived(language ?? 'code');
	const lines = useHighlightedCode(
		() => code,
		() => language ?? ''
	);

	let copied = $state(false);
	let timeout: ReturnType<typeof setTimeout> | undefined;

	function copy() {
		navigator.clipboard
			.writeText(code)
			.then(() => {
				copied = true;
				clearTimeout(timeout);
				timeout = setTimeout(() => (copied = false), 2000);
			})
			.catch(() => {});
	}

	onDestroy(() => clearTimeout(timeout));
</script>

<div data-slot="code-block" class="code-block">
	<div data-slot="code-block-header" class="d-flex min-w-0 align-items-center gap-2 px-2 pt-2">
		<div data-slot="code-block-title" class="small fw-semibold text-body-secondary text-truncate">
			{label}
		</div>
		<div data-slot="code-block-actions" class="ms-auto d-flex flex-shrink-0 align-items-center gap-1">
			<Button
				color="link"
				size="sm"
				class="text-decoration-none p-0"
				aria-label={copied ? 'Copied' : 'Copy'}
				title={copied ? 'Copied' : 'Copy'}
				onclick={copy}
			>
				{#if copied}
					<i class="bi bi-check-lg" aria-hidden="true"></i>
				{:else}
					<i class="bi bi-clipboard" aria-hidden="true"></i>
				{/if}
			</Button>
		</div>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<pre data-slot="code-block-content" class="code-block-content" tabindex="0"><code data-slot="code-block-code">{@render codeContent()}</code></pre>
</div>

{#snippet codeContent()}
	{#each lines.current as line, index (index)}<span data-slot="code-block-line">{#if typeof line === 'string'}{line || '\n'}{:else}{#each line as token, tokenIndex (tokenIndex)}<span class="code-token" style={token.style}>{token.content}</span>{/each}{/if}</span>{index < lines.current.length - 1 ? '\n' : ''}{/each}
{/snippet}

<span aria-live="polite" class="visually-hidden">{copied ? 'Copied' : ''}</span>

<style>
	.code-block {
		width: 100%;
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--bs-border-color);
		border-radius: var(--bs-border-radius);
		background: var(--bs-body-bg);
	}

	.code-block-content {
		margin: 0;
		padding: 0.5rem 0.75rem;
		overflow-x: auto;
		color: var(--bs-body-color);
		font-family: var(--bs-font-monospace);
		font-size: 0.8125rem;
		line-height: 1.5;
		white-space: pre;
		tab-size: 2;
	}

	.code-block-content:focus-visible {
		outline: 2px solid var(--bs-primary);
		outline-offset: -2px;
	}

	.code-token {
		color: var(--shiki-light, inherit);
	}

	:global([data-bs-theme='dark']) .code-token {
		color: var(--shiki-dark, inherit);
	}
</style>
