/**
 * Keyboard focus containment for the two drawer surfaces that Sveltestrap's
 * `Offcanvas` does not trap: the mobile navigation and the filter panel.
 *
 * The action focuses the first control when the drawer opens, cycles Tab and
 * Shift+Tab inside the drawer, and restores focus to the trigger when it
 * closes. It deliberately contains no presentation logic.
 */
const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(element) => element.offsetParent !== null || element === document.activeElement
	);
}

export function focusTrap(node: HTMLElement, enabled = false) {
	let active = false;
	let restore: HTMLElement | null = null;

	function root(): HTMLElement {
		return node.closest<HTMLElement>('.offcanvas') ?? node;
	}

	function onKeydown(event: KeyboardEvent): void {
		if (!active || event.key !== 'Tab') return;
		const container = root();
		const items = focusables(container);
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function activate(): void {
		if (active) return;
		active = true;
		restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		requestAnimationFrame(() => {
			const items = focusables(root());
			items[0]?.focus();
		});
	}

	function deactivate(): void {
		if (!active) return;
		active = false;
		restore?.focus();
		restore = null;
	}

	document.addEventListener('keydown', onKeydown);
	if (active) activate();

	return {
		update(next: boolean) {
			if (next) activate();
			else deactivate();
		},
		destroy() {
			document.removeEventListener('keydown', onKeydown);
		}
	};
}
