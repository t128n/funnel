<script lang="ts">
	import type { PageProps } from './$types';
	import * as Alert from '#lib/components/ui/alert';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import { Textarea } from '#lib/components/ui/textarea';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import FunnelIcon from '@lucide/svelte/icons/funnel';
	import InfoIcon from '@lucide/svelte/icons/info';

	let { form }: PageProps = $props();
</script>

<div class="bg-background flex min-h-svh items-center justify-center p-6">
	<div class="bg-card flex w-full max-w-2xl flex-col border">
		<div class="flex items-center gap-2 px-4 pt-4">
			<span class="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center">
				<FunnelIcon class="size-3.5" />
			</span>
			<span class="text-sm font-semibold tracking-tight">Funnel</span>
		</div>

		{#if form?.submitted}
			<div class="flex flex-col items-start gap-2 px-4 pt-4 pb-6" role="status">
				<Badge variant="secondary">
					<CircleCheckIcon data-icon="inline-start" />
					Received
				</Badge>
				<h1 class="text-xl font-semibold tracking-tight">Thanks — your submission is in.</h1>
				<p class="text-muted-foreground max-w-[60ch] text-sm leading-relaxed">
					A triager will review it shortly. Nothing is created on GitHub until it's accepted, so
					there's nothing else you need to do.
				</p>
				<Button href="/submit" class="mt-2">Submit another</Button>
			</div>
		{:else}
			<h1 class="sr-only">Submit an issue</h1>

			<form class="flex flex-col gap-4 px-4 pb-4" method="POST" autocomplete="off">
				<div class="flex flex-col gap-2">
					{#if form?.error}
						<Alert.Root variant="destructive">
							<Alert.Description>{form.error}</Alert.Description>
						</Alert.Root>
					{/if}

					<Input
						class="h-auto border-transparent bg-transparent px-2 text-xl font-medium tracking-tight shadow-none dark:bg-transparent"
						name="title"
						type="text"
						required
						maxlength={256}
						placeholder="Issue title"
						value={form?.title ?? ''}
						aria-label="Issue title"
					/>

					<p class="text-muted-foreground flex items-center gap-1 text-xs">
						<InfoIcon class="size-3.5 shrink-0" />
						Submissions are staged for triage before syncing to GitHub.
					</p>

					<Textarea
						class="min-h-60 resize-none border-transparent bg-transparent px-2 text-sm shadow-none dark:bg-transparent"
						name="body"
						placeholder="Add description..."
						aria-label="Description"
						value={form?.body ?? ''}
					></Textarea>
				</div>

				<Input
					class="border-transparent bg-transparent px-2 text-sm shadow-none dark:bg-transparent"
					name="source"
					type="text"
					placeholder="Add source..."
					value={form?.source ?? ''}
					aria-label="Source"
				/>

				<footer class="flex items-center justify-end border-t pt-3">
					<Button type="submit" size="lg">Submit</Button>
				</footer>
			</form>
		{/if}
	</div>
</div>
