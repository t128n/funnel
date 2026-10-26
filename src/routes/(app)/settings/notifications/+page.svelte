<script lang="ts">
	import { untrack } from 'svelte';
	import * as Card from '#lib/components/primitives/card';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const CONTROLS = [
		{
			key: 'enabled',
			label: 'Notifications',
			description:
				'Create in-app notifications for assignments, mentions, watched issues, and status changes.'
		},
		{
			key: 'native',
			label: 'Browser notifications',
			description:
				'Allow browser notifications while a Funnel tab is open. Each browser opts in separately.'
		},
		{
			key: 'new_intake',
			label: 'New intake submissions',
			description: 'Notify administrators when a public intake submission arrives.'
		}
	] as const;

	let notifications = $state(untrack(() => ({ ...data.notifications })));

	function toggle(key: keyof typeof notifications) {
		notifications = { ...notifications, [key]: !notifications[key] };
	}

	const payload = $derived(JSON.stringify({ notifications }));
</script>

<SettingsForm
	title="Notifications"
	description="Control which notification channels the instance uses. These switches apply to everyone; browser notifications still require permission in each browser."
	form={form as SettingsFormResult | null}
	{payload}
>
	<Card.Root>
		<Card.Content class="flex flex-col gap-4 pt-6">
			{#each CONTROLS as control (control.key)}
				{@const on = notifications[control.key]}
				<div class="flex items-start justify-between gap-4">
					<div class="flex min-w-0 flex-col gap-0.5">
						<span class="text-sm font-medium">{control.label}</span>
						<span class="text-muted-foreground text-xs leading-relaxed">{control.description}</span>
					</div>
					<button
						type="button"
						role="switch"
						aria-checked={on}
						aria-label={control.label}
						class="focus-visible:ring-ring/50 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors focus-visible:ring-3 {on
							? 'bg-primary'
							: 'bg-muted-foreground/30'}"
						onclick={() => toggle(control.key)}
					>
						<span
							class="bg-background pointer-events-none inline-block size-4 rounded-full shadow-sm transition-transform {on
								? 'translate-x-[1.125rem]'
								: 'translate-x-0.5'}"
						></span>
					</button>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
</SettingsForm>
