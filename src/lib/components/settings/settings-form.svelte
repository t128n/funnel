<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import { Button } from '#lib/components/ui/button';
	import type { SettingsFormResult } from './sections';

	/**
	 * One instance-settings form: ruled sections supplied as a snippet, inline
	 * validation at the top, and one save action at the end. The page still posts
	 * a single hidden JSON `payload` built by the page; nothing about the server
	 * contract changed.
	 */
	interface Props {
		/** The page's action result, for inline validation errors. */
		form: SettingsFormResult | null;
		/** Serialized settings patch submitted as the hidden `payload` field. */
		payload: string;
		children: Snippet;
		saveLabel?: string;
	}

	let { form, payload, children, saveLabel = 'Save Changes' }: Props = $props();

	let saving = $state(false);
	let saved = $state(false);

	/** Any edit clears the previous confirmation. */
	function onEdit(): void {
		saved = false;
	}
</script>

<div class="flex w-full max-w-[var(--layout-form-max)] flex-col gap-6">
	{#if form?.message}
		<div class="border-t border-error pt-3 text-body text-error" role="alert">
			<p class="font-semibold">Settings could not be saved</p>
			<p class="mt-1">{form.message}</p>
			{#if form.issues?.length}
				<ul class="mt-1 list-disc ps-4">
					{#each form.issues as issue, index (index)}
						<li>{issue}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<form
		method="POST"
		action="?/save"
		oninput={onEdit}
		onchange={onEdit}
		use:enhance={() => {
			saving = true;
			saved = false;
			return async ({ result, update }) => {
				try {
					// Keep the edited values in place: `update()` resets the form by
					// default, which blanks client-rendered inputs (no `value`
					// attribute to fall back to) and desyncs them from the state.
					await update({ reset: false });
					if (result.type === 'success') saved = true;
				} finally {
					saving = false;
				}
			};
		}}
	>
		<input type="hidden" name="payload" value={payload} />

		<div class="flex flex-col gap-6">
			{@render children()}
		</div>

		<footer class="mt-6 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
			<Button type="submit" disabled={saving} class="min-w-24">
				{saving ? 'Saving…' : saveLabel}
			</Button>
			<span class="min-h-4" aria-live="polite">
				{#if saved}
					<span class="status status-success">
						<CircleCheckIcon aria-hidden="true" />
						Saved.
					</span>
				{/if}
			</span>
		</footer>
	</form>
</div>
