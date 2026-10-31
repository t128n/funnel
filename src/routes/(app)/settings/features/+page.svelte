<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import {
		FEATURE_FLAGS,
		FEATURES_COOKIE,
		serializeFeatureOverrides,
		type FeatureOverrides
	} from '#lib/features';
	import * as Item from '#lib/components/primitives/item';
	import type { PageProps } from './$types';

	/**
	 * Feature flags (SPEC §4). Every flag lives in `#lib/features`; this page
	 * renders one toggle per flag. Values are stored per browser in a single
	 * cookie, then `invalidateAll()` re-runs the layout load so the flag is
	 * re-evaluated server-side.
	 */
	let { data }: PageProps = $props();

	let overrides = $state<FeatureOverrides>(untrack(() => ({ ...data.overrides })));

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
		document.cookie = `${FEATURES_COOKIE}=${encodeURIComponent(
			serializeFeatureOverrides(next)
		)}; path=/; max-age=31536000; samesite=lax`;
		void invalidateAll();
	}
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-5">
	<header class="flex flex-col gap-1">
		<h1 class="text-sm font-medium">Features</h1>
		<p class="text-muted-foreground text-xs leading-relaxed">
			Toggle functionality on or off. Choices are saved in this browser; the instance default comes
			from the deployment environment.
		</p>
	</header>

	{#if FEATURE_FLAGS.length === 0}
		<p class="text-muted-foreground text-sm">No feature flags are available.</p>
	{:else}
		<div class="flex flex-col gap-3">
			{#each FEATURE_FLAGS as flag (flag.key)}
				{@const on = effective(flag.key, flag.default)}
				<Item.Root variant="outline" class="items-start gap-4">
					<Item.Content class="gap-0.5">
						<Item.Title>{flag.name}</Item.Title>
						<Item.Description>
							{flag.description}
						</Item.Description>
					</Item.Content>
					<Item.Actions class="gap-2.5">
						<span class="text-muted-foreground text-xs" aria-hidden="true">
							{on ? flag.onLabel : flag.offLabel}
						</span>
						<button
							type="button"
							role="switch"
							aria-checked={on}
							aria-label={flag.name}
							class="focus-visible:outline-ring inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-xs outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 {on
								? 'bg-primary'
								: 'bg-muted-foreground/30'}"
							onclick={() => setFlag(flag.key, !on, flag.default)}
						>
							<span
								class="bg-background pointer-events-none inline-block size-4 rounded-xs transition-transform {on
									? 'translate-x-[1.125rem]'
									: 'translate-x-0.5'}"
							></span>
						</button>
					</Item.Actions>
				</Item.Root>
			{/each}
		</div>
	{/if}
</div>
