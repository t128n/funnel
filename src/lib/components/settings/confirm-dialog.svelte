<script lang="ts">
	import {
		Button,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader
	} from '@sveltestrap/sveltestrap';

	/**
	 * Named destructive confirmation. The copy names the object and the
	 * consequence, and the destructive action is a solid danger button.
	 */
	interface Props {
		open?: boolean;
		title: string;
		description: string;
		confirmLabel: string;
		onconfirm: () => void;
	}

	let { open = $bindable(false), title, description, confirmLabel, onconfirm }: Props = $props();

	function close(): void {
		open = false;
	}

	function confirm(): void {
		open = false;
		onconfirm();
	}
</script>

<Modal isOpen={open} toggle={close}>
	<ModalHeader toggle={close}>{title}</ModalHeader>
	<ModalBody>{description}</ModalBody>
	<ModalFooter>
		<Button color="secondary" outline onclick={close}>Cancel</Button>
		<Button color="danger" onclick={confirm}>{confirmLabel}</Button>
	</ModalFooter>
</Modal>
