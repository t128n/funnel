<script lang="ts">
	import * as Avatar from '#lib/components/ui/avatar';
	import { cn } from '#lib/utils';

	interface Props {
		login: string;
		avatarUrl?: string | null;
		/** Approximate diameter in px; mapped to the token scale. */
		size?: number;
		class?: string;
	}

	let { login, avatarUrl, size = 20, class: className }: Props = $props();

	const initial = $derived(login.slice(0, 1).toUpperCase() || '?');
	const dimension = $derived(size <= 18 ? 'size-4' : size <= 24 ? 'size-(--size-avatar)' : 'size-8');
</script>

<Avatar.Root class={cn(dimension, className)} title={login}>
	{#if avatarUrl}
		<Avatar.Image src={avatarUrl} alt={login} />
	{/if}
	<Avatar.Fallback class="font-semibold">{initial}</Avatar.Fallback>
</Avatar.Root>
