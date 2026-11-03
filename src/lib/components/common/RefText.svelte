<script lang="ts">
	interface Props {
		value: string;
		title?: string;
		class?: string;
	}

	let { value, title, class: className = '' }: Props = $props();
</script>

<span class="font-monospace text-body-secondary {className}" {title}>{value}</span>
