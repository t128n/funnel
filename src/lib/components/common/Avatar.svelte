<script lang="ts">
	import * as Avatar from '#lib/components/primitives/avatar';

	interface Props {
		login: string;
		avatarUrl?: string | null;
		/** Diameter in px. */
		size?: number;
	}

	let { login, avatarUrl, size = 18 }: Props = $props();

	const initial = $derived(login.slice(0, 1).toUpperCase());
</script>

<Avatar.Root
	style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.55)}px"
	title={login}
>
	{#if avatarUrl}
		<Avatar.Image src={avatarUrl} alt={login} />
	{/if}
	<Avatar.Fallback class="font-semibold">{initial}</Avatar.Fallback>
</Avatar.Root>
