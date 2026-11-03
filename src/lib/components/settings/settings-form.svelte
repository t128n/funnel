<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';
	import { Button } from '@sveltestrap/sveltestrap';
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

<div class="d-flex flex-column gap-4">
	{#if form?.message}
		<div class="alert alert-danger mb-0" role="alert">
			<p class="fw-semibold mb-1">Settings could not be saved</p>
			<p class="mb-1">{form.message}</p>
			{#if form.issues?.length}
				<ul class="mb-0 ps-4">
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

		<div class="d-flex flex-column gap-4">
			{@render children()}
		</div>

		<footer class="mt-4 d-flex flex-wrap align-items-center gap-3 border-top pt-3">
			<Button type="submit" color="primary" disabled={saving} style="min-width: 6rem">
				{saving ? 'Saving…' : saveLabel}
			</Button>
			<span style="min-height: 1.5rem" aria-live="polite">
				{#if saved}
					<span class="d-inline-flex align-items-center gap-1 text-success">
						<i class="bi bi-check-circle" aria-hidden="true"></i>
						Saved.
					</span>
				{/if}
			</span>
		</footer>
	</form>
</div>
