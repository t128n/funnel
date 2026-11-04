<script lang="ts">
	/**
	 * The blocked state as its own indicator. Status and blocked are separate
	 * dimensions, so surfaces that need blocked on its own (issue Properties,
	 * the blocker section, board cards) use this instead of overloading the
	 * status word.
	 */
	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();
</script>

<span class="d-inline-flex align-items-center gap-1 text-nowrap text-danger {className}">
	<i class="bi bi-slash-circle" aria-hidden="true"></i>
	<span>Blocked</span>
</span>
