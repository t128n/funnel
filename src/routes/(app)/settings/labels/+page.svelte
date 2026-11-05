<script lang="ts">
	import { untrack } from 'svelte';
	import { FormGroup, FormText, Input, Label } from '@sveltestrap/sveltestrap';
	import Section from '#lib/components/settings/section.svelte';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import {
		buildReservedLabels,
		isValidLabelPrefix,
		LABEL_PREFIX_MAX_LENGTH,
		normalizeLabelPrefix
	} from '#lib/labels';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let prefix = $state(untrack(() => data.prefix));

	const normalized = $derived(normalizeLabelPrefix(prefix));
	const valid = $derived(isValidLabelPrefix(normalized));
	const preview = $derived(buildReservedLabels(normalized));
	const previewNames = $derived(preview.map((label) => label.name).join(', '));

	const payload = $derived(JSON.stringify({ labels: { prefix } }));
</script>

<SettingsForm form={form as SettingsFormResult | null} {payload}>
	<Section
		title="Reserved label prefix"
		description="Namespace Funnel’s reserved labels in every configured repository. Leave blank to keep the default names."
	>
		<FormGroup spacing="">
			<Label for="labels-prefix">Prefix</Label>
			<Input
				id="labels-prefix"
				type="text"
				placeholder="funnel"
				maxlength={LABEL_PREFIX_MAX_LENGTH}
				bind:value={prefix}
			/>
			<FormText>
				Letters, digits and single hyphens, up to {LABEL_PREFIX_MAX_LENGTH} characters. A trailing
				hyphen is ignored, so <code>funnel-</code> and <code>funnel</code> both produce
				<code>funnel-todo</code>.
			</FormText>
		</FormGroup>

		{#if !valid}
			<div class="alert alert-warning py-2" role="status">
				That prefix contains characters Funnel cannot use. Use letters, digits and single hyphens.
			</div>
		{/if}

		<div>
			<p class="mb-2 fw-semibold">Labels Funnel will provision</p>
			{#if normalized === ''}
				<p class="mb-2 text-body-secondary">No prefix: the default names are unchanged.</p>
			{:else}
				<p class="mb-2 text-body-secondary">
					Actual GitHub names: <code>{previewNames}</code>
				</p>
			{/if}
			<div class="d-flex flex-wrap gap-2">
				{#each preview as label (label.base)}
					<span class="badge text-bg-light border font-monospace fw-normal">
						{label.name}
					</span>
				{/each}
			</div>
		</div>

		<div class="alert alert-info py-2 mb-0" role="note">
			Changing the prefix never renames, patches or deletes existing GitHub labels. Old reserved
			names become ordinary labels and Funnel provisions the newly named set on its next cycle.
			Migrate existing issues manually if you want the old labels to disappear.
		</div>
	</Section>
</SettingsForm>
