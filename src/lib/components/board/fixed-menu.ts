/**
 * Anchor a menu to a trigger without inheriting the trigger's clipping context.
 *
 * Board cards live inside a lane scroller and inside Virtua items that set
 * `contain: layout style`. Either one would clip or re-base an absolutely
 * positioned dropdown, which is why the card menu is painted under the cards
 * that follow it. This action moves the menu to `document.body`, pins it with
 * `position: fixed` at the trigger's coordinates, and keeps it there while the
 * lane scrolls.
 */

export interface FixedMenuOptions {
	/** Trigger the menu is aligned to. */
	anchor: HTMLElement;
	/** Called for Escape and for pointer presses outside the menu/trigger. */
	onClose: () => void;
}

const VIEWPORT_GUTTER = 8;
const ANCHOR_GAP = 4;

interface RectLike {
	top: number;
	bottom: number;
	right: number;
}

interface Size {
	width: number;
	height: number;
}

export interface MenuPlacement {
	top: number;
	left: number;
	maxHeight: number;
}

/**
 * Place a menu below its trigger, flipping above when the viewport runs out of
 * room. Both axes stay inside the viewport gutter, and an oversized menu is
 * capped so it scrolls internally instead of leaving the screen.
 */
export function placeMenu(trigger: RectLike, menu: Size, viewport: Size): MenuPlacement {
	const maxHeight = Math.max(0, viewport.height - VIEWPORT_GUTTER * 2);
	const height = Math.min(menu.height, maxHeight);
	const left = Math.min(
		Math.max(trigger.right - menu.width, VIEWPORT_GUTTER),
		Math.max(VIEWPORT_GUTTER, viewport.width - menu.width - VIEWPORT_GUTTER)
	);

	let top = trigger.bottom + ANCHOR_GAP;
	if (top + height > viewport.height - VIEWPORT_GUTTER) {
		const above = trigger.top - height - ANCHOR_GAP;
		top =
			above >= VIEWPORT_GUTTER
				? above
				: Math.max(VIEWPORT_GUTTER, viewport.height - height - VIEWPORT_GUTTER);
	}

	return { top, left, maxHeight };
}

export function fixedMenu(node: HTMLElement, options: FixedMenuOptions) {
	let { anchor, onClose } = options;

	document.body.appendChild(node);
	node.style.position = 'fixed';
	node.style.inset = 'auto';
	node.style.zIndex = '1040';

	/** Keep the menu pinned to the trigger while the lane or page scrolls. */
	function place() {
		const trigger = anchor.getBoundingClientRect();
		const menu = node.getBoundingClientRect();
		const { top, left, maxHeight } = placeMenu(trigger, menu, {
			width: window.innerWidth,
			height: window.innerHeight
		});

		node.style.maxHeight = `${maxHeight}px`;
		node.style.overflowY = menu.height > maxHeight ? 'auto' : '';
		node.style.left = `${left}px`;
		node.style.top = `${top}px`;
	}

	function onPointerDown(event: PointerEvent) {
		const target = event.target as Node | null;
		if (!target || node.contains(target) || anchor.contains(target)) return;
		onClose();
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		onClose();
	}

	place();
	window.addEventListener('scroll', place, true);
	window.addEventListener('resize', place);
	document.addEventListener('pointerdown', onPointerDown, true);
	document.addEventListener('keydown', onKeyDown, true);

	return {
		update(next: FixedMenuOptions) {
			({ anchor, onClose } = next);
			place();
		},
		destroy() {
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('keydown', onKeyDown, true);
			node.remove();
		}
	};
}
