<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Avatar from '#lib/components/ui/avatar';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import { ROLES, type Role } from '#lib/roles';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let saving = $state<string | null>(null);

	const ROLE_LABELS: Record<Role, string> = {
		read: 'Read',
		write: 'Write',
		admin: 'Admin'
	};

	function initial(name: string): string {
		return name.slice(0, 1).toUpperCase() || '?';
	}
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-5">
	<header class="flex flex-col gap-1">
		<h1 class="text-sm font-medium">People &amp; roles</h1>
		<p class="text-muted-foreground text-xs leading-relaxed">
			Who can use this instance. <strong>Read</strong> can view the cockpit, <strong>write</strong> can also edit
			issues, and <strong>admin</strong> can manage settings and people.
		</p>
	</header>

	{#if form?.message}
		<p class="text-destructive text-xs">{form.message}</p>
	{/if}

	<Card.Root>
		<Card.Content class="pt-6">
			<ul class="flex flex-col divide-y divide-[color:var(--surface-divider)]">
				{#each data.users as user (user.id)}
					<li class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
						<Avatar.Root class="size-9 shrink-0 rounded-lg">
							{#if user.image}
								<Avatar.Image src={user.image} alt={user.name} />
							{/if}
							<Avatar.Fallback class="rounded-lg">{initial(user.name)}</Avatar.Fallback>
						</Avatar.Root>

						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="truncate text-sm font-medium">
								{user.name}
								{#if user.id === data.currentUserId}
									<span class="text-muted-foreground ms-1.5 text-xs">(you)</span>
								{/if}
							</span>
							{#if user.login}
								<span class="text-muted-foreground truncate text-xs">@{user.login}</span>
							{:else}
								<span class="text-muted-foreground truncate text-xs">{user.email}</span>
							{/if}
						</div>

						<form
							method="POST"
							action="?/setRole"
							class="flex shrink-0 items-center gap-2"
							use:enhance={() => {
								saving = user.id;
								return async ({ result, update }) => {
									await update();
									saving = null;
									if (result.type === 'success') {
										toast.success(`${user.name}'s role updated`);
									} else if (result.type === 'failure' && typeof result.data?.message === 'string') {
										toast.error(result.data.message);
									}
								};
							}}
						>
							<input type="hidden" name="userId" value={user.id} />
							<NativeSelect.Root name="role" value={user.role} size="sm" aria-label="Role">
								{#each ROLES as role (role)}
									<NativeSelect.Option value={role}>{ROLE_LABELS[role]}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
							<Button type="submit" variant="outline" size="sm" disabled={saving === user.id}>
								{saving === user.id ? 'Saving…' : 'Save'}
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>
</div>
