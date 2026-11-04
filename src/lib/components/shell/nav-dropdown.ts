import { tick } from 'svelte';
import { isMenuKey, menuFocusIndex } from './dropdown-menu';

/**
 * Bootstrap's dropdown keyboard contract for the navbar menus.
 *
 * Sveltestrap opens and closes the menu but leaves focus on the toggle and
 * ignores Escape/arrow keys. This action is attached to a wrapper around each
 * navbar dropdown: it moves focus through the open menu, closes on Escape and
 * returns focus to the toggle. Tab is deliberately untouched so the menu still
 * closes naturally when focus leaves.
 */
export function navDropdownKeyboard(node: HTMLElement) {
	function toggle(): HTMLElement | null {
		return node.querySelector<HTMLElement>('[aria-expanded]');
	}

	function isOpen(button: HTMLElement | null): boolean {
		return button?.getAttribute('aria-expanded') === 'true';
	}

	function menuItems(): HTMLElement[] {
		return Array.from(
			node.querySelectorAll<HTMLElement>(
				'.dropdown-menu a.dropdown-item, .dropdown-menu button.dropdown-item'
			)
		).filter(
			(item) =>
				!item.hasAttribute('disabled') &&
				!item.classList.contains('disabled') &&
				item.getAttribute('aria-disabled') !== 'true'
		);
	}

	function focusAt(items: HTMLElement[], index: number | null): void {
		if (index !== null && items[index]) items[index].focus();
	}

	function handleKeydown(event: KeyboardEvent): void {
		const button = toggle();
		if (!button) return;

		const open = isOpen(button);

		if (event.key === 'Escape' && open) {
			event.preventDefault();
			event.stopPropagation();
			button.click();
			button.focus();
			return;
		}

		if (!isMenuKey(event.key)) return;

		// ArrowDown/ArrowUp on a closed toggle open the menu and enter it, as
		// Bootstrap does. Keydown on the toggle itself is not otherwise handled,
		// so Enter/Space keep their native open behaviour.
		if (!open) {
			if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
			event.preventDefault();
			button.click();
			void tick().then(() => {
				const items = menuItems();
				focusAt(items, event.key === 'ArrowDown' ? 0 : items.length - 1);
			});
			return;
		}

		const items = menuItems();
		const current = items.indexOf(document.activeElement as HTMLElement);
		const next = menuFocusIndex(event.key, current, items.length);
		if (next === null) return;
		event.preventDefault();
		focusAt(items, next);
	}

	node.addEventListener('keydown', handleKeydown);
	return {
		destroy() {
			node.removeEventListener('keydown', handleKeydown);
		}
	};
}
