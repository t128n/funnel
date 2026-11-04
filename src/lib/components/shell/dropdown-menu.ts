/**
 * Keyboard movement for Bootstrap dropdown menus.
 *
 * Pure so the shell can share one implementation across every navbar menu and
 * the behaviour can be unit-tested without a DOM. The action in
 * `nav-dropdown.ts` supplies the item count and applies the returned index.
 */

/** The menu keys the navbar supports (Bootstrap's dropdown contract). */
export type MenuKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export function isMenuKey(key: string): key is MenuKey {
	return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
}

/**
 * The item index a key should focus, or `null` when the key is not a menu
 * movement key or the menu is empty.
 *
 * `currentIndex` is `-1` when focus is still on the toggle. Arrow keys wrap
 * like Bootstrap's menu loops; Home/End jump to the first/last item.
 */
export function menuFocusIndex(
	key: string,
	currentIndex: number,
	itemCount: number
): number | null {
	if (!isMenuKey(key) || itemCount <= 0) return null;
	if (key === 'Home') return 0;
	if (key === 'End') return itemCount - 1;
	if (key === 'ArrowDown') {
		if (currentIndex < 0) return 0;
		return (currentIndex + 1) % itemCount;
	}
	if (currentIndex < 0) return itemCount - 1;
	return (currentIndex - 1 + itemCount) % itemCount;
}
