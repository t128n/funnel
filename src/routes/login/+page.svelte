<script lang="ts">
	import { signInWithGitHub } from '#lib/client/auth';
	import { Button } from '#lib/components/ui/button';
	import { Spinner } from '#lib/components/ui/spinner';
	import { Field, FieldDescription, FieldGroup } from '#lib/components/ui/field';
	import FunnelIcon from '@lucide/svelte/icons/funnel';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let pending = $state(false);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		pending = true;
		void signInWithGitHub(data.redirectTo);
	}
</script>

<main class="bg-background flex min-h-svh flex-col items-center justify-center p-6">
	<div class="w-full max-w-sm">
		<div class="flex flex-col gap-6">
			<form onsubmit={submit}>
				<FieldGroup>
					<div class="flex flex-col items-center gap-2 text-center">
						<FunnelIcon class="size-10" />
						<h1 class="text-xl font-medium">Welcome to Funnel</h1>
					</div>
					<Field>
						<Button type="submit" disabled={pending}>
							{#if pending}
								<Spinner data-icon="inline-start" />
								Redirecting…
							{:else}
								<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
									<path
										d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-2.91-.88-2.91-2.89 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 2.01-1.14 2.69-2.91 2.89.35.3.66.89.66 1.8 0 1.3-.01 2.35-.01 2.67 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
									/>
								</svg>
								Continue with GitHub
							{/if}
						</Button>
					</Field>
				</FieldGroup>
			</form>
			<FieldDescription class="text-center">
				Access is limited to your GitHub organization.
			</FieldDescription>
		</div>
	</div>
</main>
