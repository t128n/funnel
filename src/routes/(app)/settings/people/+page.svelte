<script lang="ts">
	import { enhance } from '$app/forms';
	import { Alert, Button, Table } from '@sveltestrap/sveltestrap';
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

<div class="d-flex w-100 flex-column gap-4">
	{#if form?.message}
		<Alert color="danger" class="mb-0">
			<p class="fw-semibold mb-1">The role could not be changed</p>
			<p class="mb-0">{form.message}</p>
		</Alert>
	{/if}

	<Section
		title="People"
		description="Read can view the cockpit, write can also edit issues, and admin can manage settings and people."
	>
		<Table responsive hover class="align-middle">
			<thead>
				<tr>
					<th scope="col">Person</th>
					<th scope="col">GitHub</th>
					<th scope="col">Role</th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as user (user.id)}
					<tr>
						<td>
							<div class="d-flex min-w-0 align-items-start gap-2">
								<span
									class="d-inline-flex flex-shrink-0 align-items-center justify-content-center rounded-circle bg-body-secondary small fw-semibold text-body-secondary"
									style="width:1.5rem;height:1.5rem"
									aria-hidden="true"
								>
									{initial(user.name)}
								</span>
								<div class="d-flex min-w-0 flex-column">
									<span class="text-truncate fw-semibold">{user.name}</span>
									{#if user.id === data.currentUserId}
										<span class="small text-body-tertiary">You</span>
									{/if}
								</div>
							</div>
						</td>
						<td>
							<span class="text-body-secondary">
								{user.login ? `@${user.login}` : user.email}
							</span>
						</td>
						<td>
							<form
								method="POST"
								action="?/setRole"
								class="d-flex flex-wrap align-items-center gap-2"
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
								<select
									name="role"
									class="form-select form-select-sm"
									value={user.role}
									aria-label={`Role for ${user.name}`}
									style="width:7rem"
								>
									{#each ROLES as role (role)}
										<option value={role}>{ROLE_LABELS[role]}</option>
									{/each}
								</select>
								<Button type="submit" color="outline-secondary" size="sm" disabled={saving === user.id}>
									{saving === user.id ? 'Saving…' : 'Save'}
								</Button>
								<span style="min-height:1rem" aria-live="polite">
									{#if savedId === user.id}
										<span class="d-inline-flex align-items-center gap-1 small text-success">
											<i class="bi bi-check-circle" aria-hidden="true"></i>
											Saved.
										</span>
									{:else if rowErrors[user.id]}
										<span class="small text-danger">{rowErrors[user.id]}</span>
									{/if}
								</span>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</Table>
	</Section>
</div>
