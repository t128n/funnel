<script lang="ts">
	interface Props {
		login: string;
		avatarUrl?: string | null;
		/** Approximate diameter in px. */
		size?: number;
		class?: string;
	}

	let { login, avatarUrl, size = 20, class: className = '' }: Props = $props();

	const initial = $derived(login.slice(0, 1).toUpperCase() || '?');
</script>

<span
	class="funnel-avatar {className}"
	style={`width:${size}px;height:${size}px`}
	role="img"
	aria-label={login}
	title={login}
>
	{#if avatarUrl}
		<img src={avatarUrl} alt="" loading="lazy" />
	{:else}
		<span aria-hidden="true">{initial}</span>
	{/if}
</span>
