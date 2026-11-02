<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import {
		FEATURE_FLAGS,
		FEATURES_COOKIE,
		serializeFeatureOverrides,
		type FeatureOverrides
	} from '#lib/features';
	import * as Switch from '#lib/components/ui/switch';
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

<div class="flex w-full max-w-[var(--layout-form-max)] flex-col gap-6">
	<section class="border-t border-border-subtle pt-4">
		<h2 class="text-heading-sm font-semibold leading-heading-sm text-fg">Browser overrides</h2>
		<p class="mt-1 text-body leading-body text-fg-secondary">
			Choices apply to this browser only. The instance default comes from the deployment
			environment.
		</p>

		{#if FEATURE_FLAGS.length === 0}
			<p class="mt-4 text-body text-fg-secondary">No feature flags are available.</p>
		{:else}
			<div class="mt-4 border-t border-border-subtle">
				{#each FEATURE_FLAGS as flag (flag.key)}
					{@const on = effective(flag.key, flag.default)}
					<div class="flex items-start gap-4 border-b border-border-subtle py-3">
						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="text-body font-semibold text-fg">{flag.name}</span>
							<span class="text-body leading-body text-fg-secondary">{flag.description}</span>
							<span class="text-caption text-fg-muted">{on ? flag.onLabel : flag.offLabel}</span>
						</div>
						<div class="flex shrink-0 items-center gap-3">
							<span class="min-w-16 text-right" aria-live="polite">
								{#if savedKey === flag.key}
									<span class="status status-success">
										<CircleCheckIcon aria-hidden="true" />
										Saved.
									</span>
								{/if}
							</span>
							<Switch.Root
								checked={on}
								onCheckedChange={(next) => setFlag(flag.key, next, flag.default)}
								aria-label={flag.name}
							/>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
