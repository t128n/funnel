<script lang="ts" module>
	export type CodeBlockLineVariant = "default" | "added" | "removed" | "highlighted";

	/** Diff line tones; colour stays on the line, never on the block edge. */
	const variantClass: Record<CodeBlockLineVariant, string> = {
		default: "",
		added: "bg-muted after:content-['+']",
		removed: "bg-destructive/10 text-destructive after:content-['−']",
		highlighted: "bg-muted"
	};

	/** One highlighted token, such as one returned by `useHighlightedCode`. */
	export type CodeBlockLineToken = {
		content: string;
		style?: string;
		class?: string;
	};

	/** Line tone helper kept for the barrel API. */
	export function codeBlockLineVariants(variant: CodeBlockLineVariant = "default"): string {
		return variantClass[variant];
	}
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		code,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		variant?: CodeBlockLineVariant;
		/** The line as plain text, or as highlighted tokens. When it is set, `children` is ignored. */
		code?: string | CodeBlockLineToken[];
	} = $props();

	const newline = "\n";
</script>

<!-- An empty line holds a newline so copying a selection keeps blank lines. -->
<span
	bind:this={ref}
	data-slot="code-block-line"
	data-variant={variant}
	class={cn(
		"relative block min-h-[1lh] -mx-3 px-3",
		"group-data-[size=sm]/code-block:-mx-2.5 group-data-[size=sm]/code-block:px-2.5",
		"in-data-numbered:col-span-2 in-data-numbered:grid in-data-numbered:grid-cols-subgrid in-data-numbered:gap-x-3 in-data-numbered:[counter-increment:line]",
		"in-data-numbered:before:min-w-6 in-data-numbered:before:text-end in-data-numbered:before:text-muted-foreground in-data-numbered:before:content-[counter(line)] in-data-numbered:before:select-none",
		"in-data-numbered:supports-[content:counter(line)_/_'']:before:content-[counter(line)_/_'']",
		"after:absolute after:start-1 after:top-0 after:text-muted-foreground after:select-none",
		variantClass[variant],
		className
	)}
	{...restProps}
>
	<span data-slot="code-block-line-content" class="min-w-0">
		{#if typeof code === "string"}
			{code || newline}
		{:else if code?.length}
			{#each code as token, index (index)}
				<span style={token.style} class={token.class}>{token.content}</span>
			{/each}
		{:else if code}
			{newline}
		{:else if children}
			{@render children()}
		{:else}
			{newline}
		{/if}
	</span>
</span>
