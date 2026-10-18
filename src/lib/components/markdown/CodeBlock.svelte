<script lang="ts">
	import * as CodeBlock from '#lib/components/ui/code-block';
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
</script>

<CodeBlock.Root size="sm">
	<CodeBlock.Header>
		<CodeBlock.Title>{label}</CodeBlock.Title>
		<CodeBlock.Actions>
			<CodeBlock.CopyButton value={code} />
		</CodeBlock.Actions>
	</CodeBlock.Header>
	<CodeBlock.Content>
		{#each lines.current as line, index (index)}
			<CodeBlock.Line code={line} />
		{/each}
	</CodeBlock.Content>
</CodeBlock.Root>
