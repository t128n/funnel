<script lang="ts">
	import { untrack } from 'svelte';
	import { FormCheck } from '@sveltestrap/sveltestrap';
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

<SettingsForm form={form as SettingsFormResult | null} {payload}>
	<Section
		title="Channels"
		description="These switches apply to everyone. Browser notifications still require permission in each browser."
	>
		<div>
			{#each CONTROLS as control, index (control.key)}
				{@const on = notifications[control.key]}
				<div
					class="d-flex align-items-start justify-content-between gap-3 py-2 {index <
					CONTROLS.length - 1
						? 'border-bottom'
						: ''}"
				>
					<div class="min-w-0">
						<div class="fw-medium">{control.label}</div>
						<div class="small text-body-secondary">{control.description}</div>
					</div>
					<FormCheck
						id={`notification-${control.key}`}
						type="switch"
						class="flex-shrink-0"
						checked={on}
						on:change={() => toggle(control.key)}
						aria-label={control.label}
					/>
				</div>
			{/each}
		</div>
	</Section>
</SettingsForm>
