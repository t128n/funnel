<script lang="ts">
	import { goto } from '$app/navigation';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import * as Avatar from '#lib/components/ui/avatar';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import { signOut } from '#lib/client/auth';
	import type { PageProps } from './$types';

	/**
	 * Settings landing: the signed-in user's context. `data.user` (better-auth)
	 * and `data.viewerGithub` come from the cockpit layout load, so this page
	 * needs no loader of its own.
	 */
	let { data }: PageProps = $props();

	const initial = $derived(data.user.name.slice(0, 1).toUpperCase() || '?');
	const githubProfile = $derived(
		data.viewerGithub ? `${data.githubUrl}/${data.viewerGithub.login}` : null
	);

	async function handleSignOut() {
		await signOut();
		await goto('/login');
	}
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-5">
	<header class="flex flex-col gap-1">
		<h1 class="text-sm font-medium">Account</h1>
		<p class="text-muted-foreground text-xs leading-relaxed">
			Your profile and how you sign in to Funnel.
		</p>
	</header>

	<Card.Root>
		<Card.Content class="flex flex-wrap items-center gap-4 pt-6">
			<Avatar.Root class="size-14 shrink-0 rounded-xl">
				{#if data.user.image}
					<Avatar.Image src={data.user.image} alt={data.user.name} />
				{/if}
				<Avatar.Fallback class="rounded-xl">{initial}</Avatar.Fallback>
			</Avatar.Root>

			<div class="flex min-w-0 flex-1 flex-col gap-1">
				<span class="truncate text-sm font-medium">{data.user.name}</span>
				<a
					href={`mailto:${data.user.email}`}
					class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 w-fit truncate rounded text-xs outline-none focus-visible:ring-2"
				>
					{data.user.email}
				</a>

				{#if data.viewerGithub && githubProfile}
					<a
						href={githubProfile}
						target="_blank"
						rel="noreferrer"
						class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 mt-0.5 inline-flex w-fit items-center gap-1.5 rounded text-xs outline-none focus-visible:ring-2"
					>
						<Avatar.Root class="size-4 shrink-0 rounded-full">
							<Avatar.Image src={data.viewerGithub.avatarUrl} alt="" />
							<Avatar.Fallback class="rounded-full text-[0.5rem]">gh</Avatar.Fallback>
						</Avatar.Root>
						<span>@{data.viewerGithub.login}</span>
						<ExternalLinkIcon class="size-3" />
					</a>
				{/if}
			</div>

			<Button
				variant="outline"
				size="sm"
				class="ms-auto shrink-0"
				onclick={() => void handleSignOut()}
			>
				<LogOutIcon />
				Sign out
			</Button>
		</Card.Content>
	</Card.Root>

	<div>
		<Button variant="ghost" size="sm" href="/issues">
			<ArrowLeftIcon />
			Back to cockpit
		</Button>
	</div>
</div>
