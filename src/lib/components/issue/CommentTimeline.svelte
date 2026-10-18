<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import * as Bubble from '#lib/components/ui/bubble';
	import * as Message from '#lib/components/ui/message';
	import { absoluteTime, relativeTime } from '#lib/time';
	import type { RenderedComment } from '#lib/server/issues/types';

	/**
	 * The issue activity timeline. `bubbles` swaps between the compact,
	 * divider-separated list (default) and the chat-style `Message`/`Bubble`
	 * thread selected by the comment-UI flag.
	 */
	interface Props {
		comments: RenderedComment[];
		bubbles?: boolean;
	}

	let { comments, bubbles = false }: Props = $props();
</script>

{#if bubbles}
	<ul class="flex flex-col gap-4">
		{#each comments as entry (entry.githubId)}
			<li>
				<Message.Root>
					<Message.Avatar>
						<Avatar
							login={entry.author?.login ?? 'ghost'}
							avatarUrl={entry.author?.avatarUrl}
							size={32}
						/>
					</Message.Avatar>
					<Message.Content>
						<Message.Header class="gap-2">
							<strong class="text-foreground font-medium">
								{entry.author?.login ?? 'ghost'}
							</strong>
							<span title={absoluteTime(entry.createdAt)}>
								{relativeTime(entry.createdAt)}
							</span>
						</Message.Header>
						<Bubble.Root variant="muted">
							<Bubble.Content class="markdown text-sm">
								{@html entry.bodyHtml}
							</Bubble.Content>
						</Bubble.Root>
					</Message.Content>
				</Message.Root>
			</li>
		{/each}
	</ul>
{:else}
	<ul class="flex flex-col">
		{#each comments as entry (entry.githubId)}
			<li class="border-border flex gap-2.5 border-t py-3 first:border-t-0 first:pt-0 last:pb-0">
				<Avatar
					login={entry.author?.login ?? 'ghost'}
					avatarUrl={entry.author?.avatarUrl}
					size={22}
				/>
				<div class="flex min-w-0 flex-1 flex-col gap-1">
					<div class="flex items-baseline gap-2 text-xs">
						<strong class="font-medium">{entry.author?.login ?? 'ghost'}</strong>
						<span class="text-muted-foreground" title={absoluteTime(entry.createdAt)}>
							{relativeTime(entry.createdAt)}
						</span>
					</div>
					<div class="markdown text-foreground text-sm">{@html entry.bodyHtml}</div>
				</div>
			</li>
		{/each}
	</ul>
{/if}
