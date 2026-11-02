<script lang="ts">
	import { untrack } from 'svelte';
	import * as Switch from '#lib/components/ui/switch';
	import Section from '#lib/components/settings/section.svelte';
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
	form={form as SettingsFormResult | null}
	{payload}
>
	<Section
		title="Channels"
		description="These switches apply to everyone. Browser notifications still require permission in each browser."
	>
		<div class="border-t border-border-subtle">
			{#each CONTROLS as control (control.key)}
				{@const on = notifications[control.key]}
				<div class="flex items-start gap-4 border-b border-border-subtle py-3">
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<span class="text-body font-semibold text-fg">{control.label}</span>
						<span class="text-body leading-body text-fg-secondary">{control.description}</span>
						<span class="text-caption text-fg-muted">{on ? 'On' : 'Off'}</span>
					</div>
					<Switch.Root
						checked={on}
						onCheckedChange={() => toggle(control.key)}
						aria-label={control.label}
					/>
				</div>
			{/each}
		</div>
	</Section>
</SettingsForm>
