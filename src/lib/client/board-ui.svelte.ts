/**
 * Small coordinate for board keyboard interactions.
 *
 * The board registers a single global `S` hotkey (see `#lib/client/hotkeys`);
 * because the callback is app-scoped it cannot close over a particular card, so
 * cards publish their focus here and the shortcut raises the menu for whichever
 * card is focused. Keeping it in a module also avoids one window listener per
 * card on a long board.
 */

let focusedKey = $state<string | null>(null);
let menuRequestKey = $state<string | null>(null);
let openRequestKey = $state<string | null>(null);

/** Record which card currently holds focus. */
export function setFocusedCard(key: string): void {
  focusedKey = key;
}

/** Drop focus for `key` (only when it still owns it). */
export function clearFocusedCard(key: string): void {
  if (focusedKey === key) focusedKey = null;
}

/** Ask the focused card to open its status menu (the `S` shortcut). */
export function requestFocusedCardMenu(): void {
  if (focusedKey) menuRequestKey = focusedKey;
}

/** The card whose menu was requested, or `null`. */
export function getMenuRequestKey(): string | null {
  return menuRequestKey;
}

/** Acknowledge a menu request once the owning card has opened. */
export function clearMenuRequest(): void {
  menuRequestKey = null;
}

/** Ask the focused card to open its detail pane (the `X` shortcut). */
export function requestFocusedCardOpen(): void {
  if (focusedKey) openRequestKey = focusedKey;
}

/** The card whose detail pane was requested, or `null`. */
export function getOpenRequestKey(): string | null {
  return openRequestKey;
}

/** Acknowledge an open request once the owning card has navigated. */
export function clearOpenRequest(): void {
  openRequestKey = null;
}
