<script lang="ts">
	interface Props {
		/** Diameter in px. */
		size?: number;
		label?: string;
	}

	let { size = 14, label = 'Loading' }: Props = $props();
</script>

<span
	class="spinner"
	role="status"
	aria-label={label}
	style="width:{size}px;height:{size}px"
></span>

<style>
	.spinner {
		display: inline-block;
		border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
		border-top-color: currentColor;
		border-radius: var(--radius-full);
		animation: spin 0.6s linear infinite;
		flex: none;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
