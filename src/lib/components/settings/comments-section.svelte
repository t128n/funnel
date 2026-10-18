<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as Field from '#lib/components/ui/field';
	import { COMMENT_UI_COOKIE, COMMENT_UI_OPTIONS, type CommentUi } from '#lib/comment-ui';

	interface Props {
		/** The comment rendering the server resolved for this request. */
		value: CommentUi;
	}

	let { value }: Props = $props();

	const hints: Record<CommentUi, string> = {
		compact: 'A dense list of comments, best for scanning long threads.',
		bubbles: 'Chat-style bubbles that read like a conversation.'
	};

	/**
	 * Persist the choice to the cookie the layout load reads, then invalidate so
	 * the `comment-bubbles` OpenFeature flag is re-evaluated server-side and the
	 * Inspector re-renders.
	 */
	function select(next: CommentUi) {
		document.cookie = `${COMMENT_UI_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
		void invalidateAll();
	}
</script>

<Field.Set>
	<Field.Legend variant="label">Comment rendering</Field.Legend>
	<Field.Description class="-mt-1.5">
		Backed by the <code>comment-bubbles</code> feature flag. Saved per browser.
	</Field.Description>
	<div class="flex flex-col gap-2" role="radiogroup" aria-label="Comment rendering">
		{#each COMMENT_UI_OPTIONS as option (option.value)}
			<Field.Label
				class="has-[:checked]:border-ring has-[:checked]:bg-muted/50 w-full cursor-pointer flex-row items-center gap-2.5 rounded-md border p-2.5 text-xs font-normal"
			>
				<input
					type="radio"
					name="comment-ui"
					value={option.value}
					checked={value === option.value}
					onchange={() => select(option.value)}
				/>
				<span class="flex flex-col gap-0.5">
					<span class="font-medium">{option.label}</span>
					<span class="text-muted-foreground">{hints[option.value]}</span>
				</span>
			</Field.Label>
		{/each}
	</div>
</Field.Set>
