<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import type { Snippet } from 'svelte';
	import * as Alert from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import type { SettingsFormResult } from './sections';

	/**
	 * One instance-settings section: heading, fields, and a Save button. The
	 * fields are supplied as a snippet; the whole section posts a single hidden
	 * JSON `payload` built by the page, which the section's `save` action
	 * validates and applies as a patch.
	 */
	interface Props {
		title: string;
		description?: string;
		/** The page's action result, for inline validation errors. */
		form: SettingsFormResult | null;
		/** Serialized settings patch submitted as the hidden `payload` field. */
		payload: string;
		children: Snippet;
		saveLabel?: string;
	}

	let { title, description, form, payload, children, saveLabel = 'Save changes' }: Props = $props();

	let saving = $state(false);
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-5">
	<header class="flex flex-col gap-1">
		<h1 class="text-sm font-medium">{title}</h1>
		{#if description}
			<p class="text-muted-foreground text-xs leading-relaxed">{description}</p>
		{/if}
	</header>

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				await update();
				saving = false;
				if (result.type === 'success') {
					toast.success('Settings saved');
				} else if (result.type === 'failure' && typeof result.data?.message === 'string') {
					toast.error(result.data.message);
				}
			};
		}}
	>
		<input type="hidden" name="payload" value={payload} />

		{#if form?.message}
			<Alert.Root variant="destructive" class="mb-4">
				<Alert.Title>Settings could not be saved</Alert.Title>
				<Alert.Description>
					{form.message}
					{#if form.issues?.length}
						<ul class="mt-1 list-disc ps-4">
							{#each form.issues as issue (issue)}
								<li>{issue}</li>
							{/each}
						</ul>
					{/if}
				</Alert.Description>
			</Alert.Root>
		{/if}

		<div class="flex flex-col gap-4">
			{@render children()}
		</div>

		<footer class="mt-5 flex justify-end">
			<Button type="submit" disabled={saving}>{saving ? 'Saving…' : saveLabel}</Button>
		</footer>
	</form>
</div>
