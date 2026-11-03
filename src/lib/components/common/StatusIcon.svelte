<script lang="ts">
	import { canonicalLabel } from '#lib/labels';

	/**
	 * Status glyph shared by the board and the dense list feeds. Bootstrap Icons
	 * carry the shape; the reserved label's hue tints it.
	 */
	const STATUS_ICONS: Record<string, string> = {
		backlog: 'bi-circle',
		todo: 'bi-circle',
		'in-progress': 'bi-circle-half',
		'in-review': 'bi-eye',
		done: 'bi-check-circle',
		blocked: 'bi-slash-circle'
	};

	interface Props {
		/** Canonical status key, `done`, `blocked`, or `null` for untriaged. */
		status: string | null | undefined;
		class?: string;
		/** Show the status name to assistive tech. */
		label?: string;
	}

	let { status, class: className = '', label }: Props = $props();

	const key = $derived(status?.toLowerCase() ?? '');
	const icon = $derived(STATUS_ICONS[key] ?? 'bi-circle');
	const color = $derived(
		key === 'done'
			? 'var(--bs-success)'
			: key === 'blocked'
				? 'var(--bs-danger)'
				: canonicalLabel(key)?.color
					? `#${canonicalLabel(key)?.color}`
					: undefined
	);
</script>

<i
	class="bi {icon} {className}"
	style={color ? `color:${color}` : undefined}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
></i>
