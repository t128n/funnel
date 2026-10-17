<script lang="ts">
	interface Props {
		login: string;
		avatarUrl?: string | null;
		size?: number;
	}

	let { login, avatarUrl, size = 18 }: Props = $props();
</script>

{#if avatarUrl}
	<img
		class="avatar"
		src={avatarUrl}
		alt={login}
		title={login}
		width={size}
		height={size}
		loading="lazy"
	/>
{:else}
	<span
		class="avatar avatar--fallback"
		title={login}
		style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.55)}px"
	>
		{login.slice(0, 1).toUpperCase()}
	</span>
{/if}

<style>
	.avatar {
		display: inline-block;
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface-layer-2);
		object-fit: cover;
		flex: none;
	}

	.avatar--fallback {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-secondary);
		font-weight: var(--weight-semibold);
		line-height: 1;
	}
</style>
