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

<SettingsForm
	form={form as SettingsFormResult | null}
	{payload}
>
	<Section
		title="Channels"
		description="These switches apply to everyone. Browser notifications still require permission in each browser."
	>
		<ul class="list-group list-group-flush border-top">
			{#each CONTROLS as control (control.key)}
				{@const on = notifications[control.key]}
				<li class="list-group-item d-flex align-items-start gap-3 px-0 py-2">
					<div class="d-flex min-w-0 flex-grow-1 flex-column gap-1">
						<span class="fw-semibold">{control.label}</span>
						<span class="small text-body-secondary">{control.description}</span>
						<span class="small text-body-tertiary">{on ? 'On' : 'Off'}</span>
					</div>
					<FormCheck
						type="switch"
						checked={on}
						on:change={() => toggle(control.key)}
						aria-label={control.label}
					/>
				</li>
			{/each}
		</ul>
	</Section>
</SettingsForm>
