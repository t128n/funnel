<script lang="ts">
	import { goto } from '$app/navigation';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import { Button } from '#lib/components/ui/button';
	import { signOut } from '#lib/client/auth';
	import { ROLES } from '#lib/roles';
	import type { PageProps } from './$types';

	/**
	 * Settings landing: the signed-in user's context. `data.user` (better-auth)
	 * and `data.viewerGithub` come from the cockpit layout load, so this page
	 * needs no loader of its own.
	 */
	let { data }: PageProps = $props();

	const githubProfile = $derived(
		data.viewerGithub ? `${data.githubUrl}/${data.viewerGithub.login}` : null
	);
	const roleLabel = $derived(
		data.user.role === ROLES[0]
			? 'Read'
			: data.user.role === ROLES[1]
				? 'Write'
				: data.user.role === ROLES[2]
					? 'Admin'
					: data.user.role
	);

	async function handleSignOut() {
		await signOut();
		await goto('/login');
	}
</script>

<div class="flex w-full max-w-[var(--layout-form-max)] flex-col gap-6">
	<section class="border-t border-border-subtle pt-4">
		<h2 class="text-heading-sm font-semibold leading-heading-sm text-fg">Profile</h2>

		<dl class="label-value mt-4">
			<dt>Name</dt>
			<dd class="truncate">{data.user.name}</dd>

			<dt>Email</dt>
			<dd class="min-w-0">
				<a class="link truncate" href={`mailto:${data.user.email}`}>{data.user.email}</a>
			</dd>

			<dt>Role</dt>
			<dd>{roleLabel}</dd>

			{#if data.viewerGithub && githubProfile}
				<dt>GitHub</dt>
				<dd class="min-w-0">
					<a
						href={githubProfile}
						target="_blank"
						rel="noreferrer"
						class="link inline-flex min-w-0 items-center gap-1.5"
					>
						<span class="truncate">@{data.viewerGithub.login}</span>
						<ExternalLinkIcon class="size-3.5 shrink-0" aria-hidden="true" />
					</a>
				</dd>
			{/if}
		</dl>
	</section>

	<section class="border-t border-border-subtle pt-4">
		<h2 class="text-heading-sm font-semibold leading-heading-sm text-fg">Session</h2>
		<p class="mt-1 text-body leading-body text-fg-secondary">
			Signing out ends this browser session. You can sign back in with GitHub.
		</p>
		<div class="mt-4">
			<Button variant="outline" onclick={() => void handleSignOut()}>
				<LogOutIcon />
				Sign Out
			</Button>
		</div>
	</section>

	<a class="link w-fit text-body" href="/issues">Back to Issues</a>
</div>
