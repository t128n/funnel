<script lang="ts">
	import { canonicalLabel } from '#lib/labels';
	import { cn } from '#lib/utils';
	import BanIcon from '@lucide/svelte/icons/ban';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleDashedCheckIcon from '@lucide/svelte/icons/circle-dashed-check';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import CircleDotDashedIcon from '@lucide/svelte/icons/circle-dot-dashed';
	import CircleIcon from '@lucide/svelte/icons/circle';

	/**
	 * Status glyph shared by the board and the dense list feeds. Standard Lucide
	 * shapes rather than CSS dots, tinted with the reserved label's hue.
	 */
	const STATUS_ICONS = {
		backlog: CircleDashedIcon,
		todo: CircleIcon,
		'in-progress': CircleDotDashedIcon,
		'in-review': CircleDashedCheckIcon,
		done: CircleCheckIcon,
		blocked: BanIcon
	} as const;

	interface Props {
		/** Canonical status key, `done`, `blocked`, or `null` for untriaged. */
		status: string | null | undefined;
		class?: string;
		/** Show the status name to assistive tech. */
		label?: string;
	}

	let { status, class: className, label }: Props = $props();

	const key = $derived(status?.toLowerCase() ?? '');
	const Icon = $derived(STATUS_ICONS[key as keyof typeof STATUS_ICONS] ?? CircleIcon);
	const color = $derived(
		key === 'done'
			? 'var(--syntax-constant)'
			: key === 'blocked'
				? 'var(--destructive)'
				: canonicalLabel(key)?.color
					? `#${canonicalLabel(key)?.color}`
					: undefined
	);
</script>

<Icon
	class={cn('size-3.5 shrink-0', !color && 'text-muted-foreground', className)}
	style={color ? `color:${color}` : undefined}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
/>
