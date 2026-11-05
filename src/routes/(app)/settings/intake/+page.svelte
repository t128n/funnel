<script lang="ts">
	import { untrack } from 'svelte';
	import { FormCheck, FormGroup, FormText, Input, Label } from '@sveltestrap/sveltestrap';
	import Section from '#lib/components/settings/section.svelte';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const repoOptions = untrack(() => data.repos);
	let defaultRepo = $state(untrack(() => data.defaultRepo));
	let rateLimitPerMinute = $state<number | null>(untrack(() => data.rateLimitPerMinute));
	let rateLimitPerHour = $state<number | null>(untrack(() => data.rateLimitPerHour));
	let honeypot = $state(untrack(() => data.honeypot));

	const payload = $derived(
		JSON.stringify({
			intake: {
				default_repo: defaultRepo.trim() || undefined,
				rate_limit_per_minute: rateLimitPerMinute,
				rate_limit_per_hour: rateLimitPerHour,
				honeypot
			}
		})
	);
</script>

<SettingsForm form={form as SettingsFormResult | null} {payload}>
	<Section
		title="Routing"
		description="Where accepted submissions go by default. Must be one of the configured repositories."
	>
		<FormGroup spacing="">
			<Label for="intake-default-repo">Default repository</Label>
			<Input type="select" id="intake-default-repo" bind:value={defaultRepo}>
				<option value="">First repository</option>
				{#each repoOptions as repo (repo)}
					<option value={repo}>{repo}</option>
				{/each}
			</Input>
			<FormText>The first configured repository is used when no default is set.</FormText>
		</FormGroup>
	</Section>

	<Section
		title="Abuse controls"
		description="Limit anonymous submissions per client address and trap automated form fills. Set a limit to 0 to disable that window."
	>
		<div class="row g-3">
			<div class="col-sm-6">
				<FormGroup spacing="">
					<Label for="intake-rate-limit-minute">Submissions per minute</Label>
					<Input
						id="intake-rate-limit-minute"
						type="number"
						min="0"
						bind:value={rateLimitPerMinute}
					/>
					<FormText>
						Per client IP, across both the API and the form. 0 disables the per-minute limit.
					</FormText>
				</FormGroup>
			</div>
			<div class="col-sm-6">
				<FormGroup spacing="">
					<Label for="intake-rate-limit-hour">Submissions per hour</Label>
					<Input
						id="intake-rate-limit-hour"
						type="number"
						min="0"
						bind:value={rateLimitPerHour}
					/>
					<FormText>
						Per client IP, across both the API and the form. 0 disables the per-hour limit.
					</FormText>
				</FormGroup>
			</div>
		</div>
		<div class="d-flex align-items-start justify-content-between gap-3 border-top pt-3">
			<div class="min-w-0">
				<div class="fw-medium">Honeypot</div>
				<div class="small text-body-secondary">
					Reject submissions that fill the form's hidden website field. The submitter sees the
					normal confirmation.
				</div>
			</div>
			<FormCheck
				id="intake-honeypot"
				type="switch"
				class="flex-shrink-0"
				checked={honeypot}
				on:change={() => (honeypot = !honeypot)}
				aria-label="Honeypot"
			/>
		</div>
	</Section>
</SettingsForm>
