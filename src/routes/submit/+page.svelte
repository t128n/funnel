<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import * as Alert from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import { Textarea } from '#lib/components/ui/textarea';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import FunnelIcon from '@lucide/svelte/icons/funnel';
	import LinkIcon from '@lucide/svelte/icons/link';

	let { form }: PageProps = $props();

	let submitting = $state(false);
	let formEl = $state<HTMLFormElement | null>(null);

	/**
	 * ⌘/Ctrl + Enter submits from within the form. This is the only bit of
	 * behaviour the plain HTML form cannot express, so it is layered on as
	 * progressive enhancement — the form still posts without JavaScript.
	 */
	$effect(() => {
		const el = formEl;
		if (!el) return;

		const onKeydown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
				event.preventDefault();
				el.requestSubmit();
			}
		};

		el.addEventListener('keydown', onKeydown);
		return () => el.removeEventListener('keydown', onKeydown);
	});
</script>

<div class="bg-background flex min-h-svh items-center justify-center p-6">
	<div class="flex w-full max-w-2xl flex-col">
		<header class="flex items-center gap-2 px-4 py-3">
			<span class="bg-primary text-primary-foreground inline-flex size-5 items-center justify-center">
				<FunnelIcon class="size-3" />
			</span>
			<span class="text-muted-foreground text-xs font-medium tracking-tight">Funnel</span>
		</header>

		{#if form?.submitted}
			<div class="flex flex-col items-start gap-2 px-4 pt-2 pb-6" role="status">
				<Badge variant="secondary">
					<CircleCheckIcon data-icon="inline-start" />
					Received
				</Badge>
				<h1 class="text-xl font-semibold tracking-tight">Thanks — your submission is in.</h1>
				<p class="text-muted-foreground max-w-[60ch] text-sm leading-relaxed">
					A triager will review it shortly. Nothing is created on GitHub until it's accepted, so
					there's nothing else you need to do.
				</p>
			</div>
			<footer class="flex items-center justify-end px-4 pb-4">
				<Button href="/submit">Submit another</Button>
			</footer>
		{:else}
			<h1 class="sr-only">Submit an issue</h1>

			<form
				bind:this={formEl}
				method="POST"
				autocomplete="off"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						// The action's inline `form.error` alert covers both the
						// enhanced and the JavaScript-free paths.
						await update();
					};
				}}
			>
				<!-- Seamless writing canvas: no interior borders, one shared left edge. -->
				<div class="flex flex-col gap-1 px-4 pt-2 pb-4">
					{#if form?.error}
						<Alert.Root variant="destructive" class="mb-2">
							<Alert.Description>{form.error}</Alert.Description>
						</Alert.Root>
					{/if}

					<!-- The `md:` size is required: `Input` bakes in `md:text-xs`. -->
					<Input
						class="hover:bg-accent/50 h-auto rounded-none border-transparent bg-transparent px-2 text-2xl font-semibold tracking-tight shadow-none md:text-2xl dark:bg-transparent"
						name="title"
						type="text"
						required
						maxlength={256}
						placeholder="Issue title"
						value={form?.title ?? ''}
						aria-label="Issue title"
					/>

					<Textarea
						class="min-h-48 resize-none rounded-none border-transparent bg-transparent px-2 py-2 text-sm shadow-none md:text-sm dark:bg-transparent"
						name="body"
						placeholder="Add description..."
						aria-label="Description"
						value={form?.body ?? ''}
					></Textarea>
				</div>

				<footer class="flex items-center justify-between gap-3 border-t px-4 py-3">
					<div class="flex items-center gap-1.5">
						<LinkIcon class="text-muted-foreground size-3.5 shrink-0" />
						<NativeSelect.Root
							name="source"
							value={form?.source ?? ''}
							size="sm"
							class="w-36"
							aria-label="Source"
						>
							<option value="">Add source…</option>
							<option value="Chat">Chat</option>
							<option value="Email">Email</option>
							<option value="Web">Web</option>
							<option value="CLI">CLI</option>
						</NativeSelect.Root>
					</div>

					<Button type="submit" disabled={submitting}>
						{#if submitting}
							<span data-icon="inline-start" class="inline-flex items-center">
								<Spinner size={12} />
							</span>
						{/if}
						Submit
						<kbd
							class="border-primary-foreground/30 text-primary-foreground/80 ml-0.5 rounded-none border px-1 font-sans text-[0.625rem] leading-4 font-normal"
							aria-hidden="true"
						>
							⌘↵
						</kbd>
					</Button>
				</footer>
			</form>
		{/if}
	</div>
</div>
