<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '@sveltestrap/sveltestrap';
	import Section from '#lib/components/settings/section.svelte';
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

<div class="d-flex w-100 flex-column gap-4">
	<Section title="Profile">
		<dl class="row mb-0">
			<dt class="col-sm-3 text-body-secondary fw-normal mb-2">Name</dt>
			<dd class="col-sm-9 text-truncate mb-2">{data.user.name}</dd>

			<dt class="col-sm-3 text-body-secondary fw-normal mb-2">Email</dt>
			<dd class="col-sm-9 mb-2">
				<a class="text-truncate" href={`mailto:${data.user.email}`}>{data.user.email}</a>
			</dd>

			<dt class="col-sm-3 text-body-secondary fw-normal mb-2">Role</dt>
			<dd class="col-sm-9 mb-2">{roleLabel}</dd>

			{#if data.viewerGithub && githubProfile}
				<dt class="col-sm-3 text-body-secondary fw-normal mb-2">GitHub</dt>
				<dd class="col-sm-9 mb-2">
					<a
						href={githubProfile}
						target="_blank"
						rel="noreferrer"
						class="d-inline-flex min-w-0 align-items-center gap-1"
					>
						<span class="text-truncate">@{data.viewerGithub.login}</span>
						<i class="bi bi-box-arrow-up-right flex-shrink-0" aria-hidden="true"></i>
					</a>
				</dd>
			{/if}
		</dl>
	</Section>

	<Section
		title="Session"
		description="Signing out ends this browser session. You can sign back in with GitHub."
	>
		<div>
			<Button color="outline-secondary" onclick={() => void handleSignOut()}>Sign out</Button>
		</div>
	</Section>

	<div>
		<a href="/issues">Back to Issues</a>
	</div>
</div>
