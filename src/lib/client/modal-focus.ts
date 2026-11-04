/**
 * Focus management for Sveltestrap modals.
 *
 * Sveltestrap renders every `Modal` as `.modal[role="dialog"]` portaled to
 * `<body>`. Its own `autoFocus` only calls `focus()` on the non-focusable
 * `.modal` element, so the browser leaves focus on the trigger (or `body`) and
 * Tab keeps walking the page behind the overlay. This module fills the gaps
 * for every dialog without touching the component call sites:
 *
 * - watches for `.modal.show` entering and leaving the DOM,
 * - moves focus to the first control inside the dialog,
 * - marks the dialog `aria-modal="true"` and names it from its title,
 * - makes the rest of the page `inert` while the dialog is open,
 * - cycles Tab and Shift+Tab inside the dialog, and
 * - restores focus to the invoking control when it closes.
 *
 * Bootstrap's own `shown.bs.modal` events are not available here because
 * Sveltestrap uses its own transitions, so a `MutationObserver` is the
 * integration point. Escape keeps coming from the modal component itself.
 */

const FOCUSABLE = [
	'a[href]',
	'area[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'iframe',
	'summary',
	'[contenteditable="true"]',
	'[tabindex]:not([tabindex="-1"])'
].join(', ');

interface DialogEntry {
	dialog: HTMLElement;
	/** Element focused before this dialog opened. */
	previous: HTMLElement | null;
	/** Stable selector for `previous`, used when a re-render replaced it. */
	previousKey: string | null;
}

/**
 * Index to focus when Tab would leave the dialog, or `-1` when the browser's
 * default traversal stays inside it.
 */
export function wrapTabIndex(count: number, index: number, backwards: boolean): number {
	if (count === 0) return -1;
	if (backwards && index <= 0) return count - 1;
	if (!backwards && index >= count - 1) return 0;
	return -1;
}

/** A control is a Tab stop only when it is enabled and has layout. */
export function isVisibleFocusTarget(element: HTMLElement): boolean {
	const control = element as HTMLElement & { disabled?: boolean };
	if (control.disabled) return false;
	return element.getClientRects().length > 0;
}

export function focusables(root: ParentNode): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisibleFocusTarget);
}

let observer: MutationObserver | null = null;
let stack: DialogEntry[] = [];
let inerted: HTMLElement[] = [];
let lastFocusedOutside: HTMLElement | null = null;
let lastPointerTarget: HTMLElement | null = null;
let titleSequence = 0;
let started = false;

function activeDialog(): HTMLElement | null {
	return stack.length > 0 ? stack[stack.length - 1].dialog : null;
}

/** The direct child of `<body>` that contains the dialog's portal wrapper. */
function topLevel(node: HTMLElement): HTMLElement {
	let current = node;
	while (current.parentElement && current.parentElement !== document.body) {
		current = current.parentElement;
	}
	return current;
}

function visibleDialogs(): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>('.modal.show')).filter(isVisibleFocusTarget);
}

/**
 * Identify an element that may be re-rendered while the dialog is open. Board
 * cards and list rows are replaced when their data updates, so the node alone
 * is not a reliable return target.
 */
function identityOf(element: HTMLElement): string | null {
	if (element.id) return `#${CSS.escape(element.id)}`;
	for (const attribute of element.getAttributeNames()) {
		if (!attribute.startsWith('data-')) continue;
		const value = element.getAttribute(attribute);
		if (value) return `[${attribute}="${CSS.escape(value)}"]`;
	}
	const label = element.getAttribute('aria-label');
	if (label) return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(label)}"]`;
	return null;
}

function describe(dialog: HTMLElement): void {
	dialog.setAttribute('aria-modal', 'true');

	const labelledBy = dialog.getAttribute('aria-labelledby');
	if (labelledBy && document.getElementById(labelledBy)) return;

	const title = dialog.querySelector<HTMLElement>('.modal-title');
	if (title) {
		if (!title.id) title.id = `funnel-modal-title-${++titleSequence}`;
		dialog.setAttribute('aria-labelledby', title.id);
		return;
	}

	if (!dialog.getAttribute('aria-label')) dialog.setAttribute('aria-label', 'Dialog');
}

/**
 * Prefer the first control in the body (the field or action the dialog is
 * about); fall back to the modal header's close button.
 */
function focusFirst(dialog: HTMLElement): void {
	const body = dialog.querySelector<HTMLElement>('.modal-body');
	const preferred = body ? focusables(body) : [];
	const target = preferred[0] ?? focusables(dialog)[0] ?? dialog;
	target.focus({ preventScroll: true });
}

function releaseInert(): void {
	for (const element of inerted) element.inert = false;
	inerted = [];
}

/** Everything except the dialog's portal is inert while a modal is open. */
function applyInert(): void {
	releaseInert();
	const dialog = activeDialog();
	if (!dialog) return;

	const keep = topLevel(dialog);
	for (const child of Array.from(document.body.children)) {
		if (!(child instanceof HTMLElement) || child === keep) continue;
		if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'LINK') continue;
		// The backdrop is a sibling portal; leaving it alone keeps backdrop
		// clicks working and it holds no interactive content.
		if (child.classList.contains('modal-backdrop') || child.querySelector('.modal-backdrop')) continue;
		child.inert = true;
		inerted.push(child);
	}
}

function isFocusable(element: HTMLElement): boolean {
	return element.matches(FOCUSABLE) && isVisibleFocusTarget(element);
}

/**
 * The control that should receive focus when a dialog closes. Dropdown menu
 * items disappear with their menu, so fall back to the visible menu control
 * that owns the hidden item rather than leaving focus on `<body>`.
 */
function returnTarget(previous: HTMLElement | null): HTMLElement | null {
	if (!previous?.isConnected) return null;
	if (isFocusable(previous)) return previous;

	let ancestor = previous.parentElement;
	while (ancestor && ancestor !== document.body) {
		if (isFocusable(ancestor)) return ancestor;
		const owner =
			ancestor.querySelector<HTMLElement>('.dropdown-toggle') ??
			ancestor.querySelector<HTMLElement>('[data-bs-toggle="dropdown"]') ??
			ancestor.querySelector<HTMLElement>('[aria-haspopup]') ??
			ancestor.querySelector<HTMLElement>('[aria-expanded]');
		if (owner?.isConnected && isVisibleFocusTarget(owner)) return owner;
		ancestor = ancestor.parentElement;
	}
	return null;
}

/**
 * Sveltestrap returns focus itself when the fade-out ends, which happens after
 * the `.show` class is gone. Wait until the closing portal has actually left
 * the DOM so our return target wins, and abort if another dialog opened.
 */
function scheduleRestore(entry: DialogEntry): void {
	const deadline = Date.now() + 500;
	const attempt = () => {
		if (activeDialog()) return;
		if (entry.dialog.isConnected && Date.now() < deadline) {
			requestAnimationFrame(attempt);
			return;
		}
		if (activeDialog()) return;

		let previous = entry.previous;
		if (!previous?.isConnected && entry.previousKey) {
			previous = document.querySelector<HTMLElement>(entry.previousKey);
		}
		returnTarget(previous)?.focus({ preventScroll: true });
	};
	requestAnimationFrame(attempt);
}

function sync(): void {
	const dialogs = visibleDialogs();

	// A dialog that has been removed from the DOM hands focus back to whatever
	// opened it (or to the dialog underneath when dialogs are stacked).
	while (stack.length > 0 && !dialogs.includes(stack[stack.length - 1].dialog)) {
		const entry = stack.pop();
		if (entry) scheduleRestore(entry);
	}

	for (const dialog of dialogs) {
		if (stack.some((entry) => entry.dialog === dialog)) continue;
		const focused = document.activeElement;
		// Focus can already sit inside the dialog when the observer runs; that
		// is not a return target.
		const outside =
			focused instanceof HTMLElement && focused !== document.body && !dialog.contains(focused);
		const previous = outside ? focused : (lastFocusedOutside ?? lastPointerTarget);
		stack.push({ dialog, previous, previousKey: previous ? identityOf(previous) : null });
		describe(dialog);
		applyInert();
		focusFirst(dialog);
	}

	if (stack.length === 0) releaseInert();
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key !== 'Tab') return;
	const dialog = activeDialog();
	if (!dialog) return;

	const items = focusables(dialog);
	if (items.length === 0) {
		event.preventDefault();
		return;
	}

	const index = items.indexOf(document.activeElement as HTMLElement);
	if (index === -1) {
		event.preventDefault();
		items[event.shiftKey ? items.length - 1 : 0].focus();
		return;
	}

	const next = wrapTabIndex(items.length, index, event.shiftKey);
	if (next !== -1) {
		event.preventDefault();
		items[next].focus();
	}
}

/** Remember the last control focused outside a dialog as a fallback trigger. */
function onFocusIn(event: FocusEvent): void {
	const target = event.target;
	if (!(target instanceof HTMLElement) || target === document.body) return;
	const dialog = activeDialog();
	if (dialog?.contains(target)) return;
	lastFocusedOutside = target;
}

/**
 * Drag-and-drop and pointer-driven flows can open a dialog without focusing
 * the control that started them. Keep the last pointer target as a fallback.
 */
function onPointerDown(event: PointerEvent): void {
	const target = event.target;
	if (!(target instanceof HTMLElement) || target.closest('.modal')) return;
	lastPointerTarget = target;
}

/**
 * Start watching for dialogs. Call once from the root layout's `onMount`.
 * Returns a cleanup function.
 */
export function initDialogFocus(): () => void {
	if (typeof document === 'undefined' || started) return () => {};
	started = true;

	document.addEventListener('keydown', onKeydown, true);
	document.addEventListener('focusin', onFocusIn, true);
	document.addEventListener('pointerdown', onPointerDown, true);

	observer = new MutationObserver(() => sync());
	observer.observe(document.body, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['class']
	});
	sync();

	return () => {
		started = false;
		observer?.disconnect();
		observer = null;
		document.removeEventListener('keydown', onKeydown, true);
		document.removeEventListener('focusin', onFocusIn, true);
		document.removeEventListener('pointerdown', onPointerDown, true);
		releaseInert();
		stack = [];
	};
}
