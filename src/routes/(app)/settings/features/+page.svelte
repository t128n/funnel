<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import { FormCheck } from '@sveltestrap/sveltestrap';
	import Section from '#lib/components/settings/section.svelte';
	import {
		FEATURE_FLAGS,
		FEATURES_COOKIE,
		serializeFeatureOverrides,
		type FeatureOverrides
	} from '#lib/features';
	import type { PageProps } from './$types';

	/**
	 * Feature flags (SPEC §4). Every flag lives in `#lib/features`; this page
	 * renders one switch per flag. Values are stored per browser in a single
	 * cookie, then `invalidateAll()` re-runs the layout load so the flag is
	 * re-evaluated server-side.
	 */
	let { data }: PageProps = $props();

	let overrides = $state<FeatureOverrides>(untrack(() => ({ ...data.overrides })));
	let savedKey = $state<string | null>(null);

	/** Effective value: a browser override, else the instance default. */
	function effective(key: string, fallback: boolean): boolean {
		return overrides[key] ?? data.defaults[key] ?? fallback;
	}

	/** Persist a toggle; drop the override when it matches the default. */
	function setFlag(key: string, value: boolean, fallback: boolean) {
		const next: FeatureOverrides = { ...overrides };
		if (value === (data.defaults[key] ?? fallback)) {
			delete next[key];
		} else {
			next[key] = value;
		}
		overrides = next;
		savedKey = key;
		document.cookie = `${FEATURES_COOKIE}=${encodeURIComponent(
			serializeFeatureOverrides(next)
		)}; path=/; max-age=31536000; samesite=lax`;
		void invalidateAll();
	}
</script>

<Section
	title="Browser overrides"
	description="Choices apply to this browser only. The instance default comes from the deployment environment."
>
	{#if FEATURE_FLAGS.length === 0}
		<p class="mb-0 text-body-secondary">No feature flags are available.</p>
	{:else}
		<div>
			{#each FEATURE_FLAGS as flag, index (flag.key)}
				{@const on = effective(flag.key, flag.default)}
				<div
					class="d-flex align-items-start justify-content-between gap-3 py-2 {index <
					FEATURE_FLAGS.length - 1
						? 'border-bottom'
						: ''}"
				>
					<div class="min-w-0">
						<div class="fw-medium">{flag.name}</div>
						<div class="small text-body-secondary">{flag.description}</div>
						<div class="small text-body-secondary">{on ? flag.onLabel : flag.offLabel}</div>
					</div>
					<div class="d-flex flex-shrink-0 align-items-center gap-2">
						<span class="small text-success" aria-live="polite">
							{#if savedKey === flag.key}Saved{/if}
						</span>
						<FormCheck
							type="switch"
							checked={on}
							on:change={(event) =>
								setFlag(flag.key, (event.currentTarget as HTMLInputElement).checked, flag.default)}
							aria-label={flag.name}
						/>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</Section>
