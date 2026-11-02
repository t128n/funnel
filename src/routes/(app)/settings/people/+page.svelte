<script lang="ts">
	import { enhance } from '$app/forms';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import { Button } from '#lib/components/ui/button';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import Section from '#lib/components/settings/section.svelte';
	import { ROLES, type Role } from '#lib/roles';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let saving = $state<string | null>(null);
	let savedId = $state<string | null>(null);
	let rowErrors = $state<Record<string, string>>({});

	const ROLE_LABELS: Record<Role, string> = {
		read: 'Read',
		write: 'Write',
		admin: 'Admin'
	};

	function initial(name: string): string {
		return name.slice(0, 1).toUpperCase() || '?';
	}

	function clearFeedback(userId: string): void {
		if (savedId === userId) savedId = null;
		if (rowErrors[userId]) {
			const next = { ...rowErrors };
			delete next[userId];
			rowErrors = next;
		}
	}
</script>

<div class="flex w-full max-w-[var(--layout-form-max)] flex-col gap-6">
	{#if form?.message}
		<div class="border-t border-error pt-3 text-body text-error" role="alert">
			<p class="font-semibold">The role could not be changed</p>
			<p class="mt-1">{form.message}</p>
		</div>
	{/if}

	<Section
		title="People"
		description="Read can view the cockpit, write can also edit issues, and admin can manage settings and people."
	>
		<div class="overflow-x-auto">
			<table class="w-full border-collapse text-body">
				<thead>
					<tr>
						<th
							class="h-9 border-b border-border-subtle bg-surface-2 px-3 text-left font-semibold"
						>
							Person
						</th>
						<th
							class="h-9 border-b border-border-subtle bg-surface-2 px-3 text-left font-semibold"
						>
							GitHub
						</th>
						<th
							class="h-9 border-b border-border-subtle bg-surface-2 px-3 text-left font-semibold"
						>
							Role
						</th>
					</tr>
				</thead>
				<tbody>
					{#each data.users as user (user.id)}
						<tr class="border-b border-border-subtle">
							<td class="py-2 pr-3 align-top">
								<div class="flex min-w-0 items-start gap-2">
									<span
										class="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-caption font-semibold text-fg-secondary"
										aria-hidden="true"
									>
										{initial(user.name)}
									</span>
									<div class="flex min-w-0 flex-col">
										<span class="truncate font-semibold text-fg">{user.name}</span>
										{#if user.id === data.currentUserId}
											<span class="text-caption text-fg-muted">You</span>
										{/if}
									</div>
								</div>
							</td>
							<td class="py-2 pr-3 align-top">
								<span class="text-body text-fg-secondary">
									{user.login ? `@${user.login}` : user.email}
								</span>
							</td>
							<td class="py-2 align-top">
								<form
									method="POST"
									action="?/setRole"
									class="flex flex-wrap items-center gap-2"
									oninput={() => clearFeedback(user.id)}
									onchange={() => clearFeedback(user.id)}
									use:enhance={() => {
										saving = user.id;
										savedId = null;
										const next = { ...rowErrors };
										delete next[user.id];
										rowErrors = next;
										return async ({ result, update }) => {
											try {
												await update();
												if (result.type === 'success') {
													savedId = user.id;
												} else if (
													result.type === 'failure' &&
													typeof result.data?.message === 'string'
												) {
													rowErrors = { ...rowErrors, [user.id]: result.data.message };
												}
											} finally {
												saving = null;
											}
										};
									}}
								>
									<input type="hidden" name="userId" value={user.id} />
									<NativeSelect.Root
										name="role"
										value={user.role}
										aria-label={`Role for ${user.name}`}
										class="w-28"
									>
										{#each ROLES as role (role)}
											<NativeSelect.Option value={role}>{ROLE_LABELS[role]}</NativeSelect.Option>
										{/each}
									</NativeSelect.Root>
									<Button type="submit" variant="outline" disabled={saving === user.id}>
										{saving === user.id ? 'Saving…' : 'Save'}
									</Button>
									<span class="min-h-4" aria-live="polite">
										{#if savedId === user.id}
											<span class="status status-success">
												<CircleCheckIcon aria-hidden="true" />
												Saved.
											</span>
										{:else if rowErrors[user.id]}
											<span class="status status-error">{rowErrors[user.id]}</span>
										{/if}
									</span>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Section>
</div>
