/**
 * Settings-dialog open state.
 *
 * The dialog is rendered once in the cockpit layout while its trigger lives in
 * the sidebar's user menu. Keeping the state in a module avoids nesting a modal
 * `Dialog` inside the mobile sidebar `Sheet` (also a modal): the trigger closes
 * the sheet first, then opens the dialog here.
 */

let open = $state(false);

/** Whether the settings dialog is currently open. */
export function isSettingsOpen(): boolean {
  return open;
}

/** Open the settings dialog. */
export function openSettings(): void {
  open = true;
}

/** Close the settings dialog. */
export function closeSettings(): void {
  open = false;
}
