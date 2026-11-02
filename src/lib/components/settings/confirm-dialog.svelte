<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog';
	import { Button } from '#lib/components/ui/button';

	/**
	 * Named destructive confirmation. Uses the shared dialog primitive because
	 * the alert-dialog wrapper is not part of this slice; the copy still names
	 * the object and the consequence, and the destructive action is a solid
	 * error button.
	 */
	interface Props {
		open?: boolean;
		title: string;
		description: string;
		confirmLabel: string;
		onconfirm: () => void;
	}

	let { open = $bindable(false), title, description, confirmLabel, onconfirm }: Props = $props();

	function confirm(): void {
		open = false;
		onconfirm();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button variant="destructive" onclick={confirm}>{confirmLabel}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
