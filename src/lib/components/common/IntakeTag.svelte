<script lang="ts">
	interface Props {
		source?: string | null;
		class?: string;
	}

	let { source = null, class: className = '' }: Props = $props();
</script>

<span class="badge text-bg-secondary fw-semibold flex-shrink-0 {className}">
	{source ?? 'Intake'}
</span>
