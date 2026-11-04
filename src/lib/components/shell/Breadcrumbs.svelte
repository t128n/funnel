<script lang="ts">
	import { Breadcrumb, BreadcrumbItem } from '@sveltestrap/sveltestrap';

	/**
	 * One labelled Bootstrap breadcrumb for index and detail pages.
	 *
	 * The `aria-label` lives here so every page that uses the wrapper exposes a
	 * named navigation landmark instead of an unnamed `<nav>`. The last item is
	 * the current page and is marked with `aria-current="page"`.
	 */
	export interface BreadcrumbEntry {
		label: string;
		/** Omit on the current item; parent sections always link. */
		href?: string;
	}

	interface Props {
		items: BreadcrumbEntry[];
		class?: string;
	}

	let { items, class: className = '' }: Props = $props();
</script>

<Breadcrumb class="mb-2 {className}" aria-label="breadcrumb">
	{#each items as item, index (index)}
		<BreadcrumbItem
			active={index === items.length - 1}
			class={index === items.length - 1 ? 'text-break' : ''}
		>
			{#if item.href && index < items.length - 1}
				<a href={item.href}>{item.label}</a>
			{:else}
				{item.label}
			{/if}
		</BreadcrumbItem>
	{/each}
</Breadcrumb>
