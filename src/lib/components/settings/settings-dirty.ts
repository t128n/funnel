/**
 * Shared dirty state for the settings surface.
 *
 * `SettingsForm` owns the per-section baseline; the settings layout reads this
 * store to show the unsaved indicator and guard navigation away from an edited
 * section. Keeping it in one small store means the desktop sidebar, the mobile
 * section switcher and plain links all observe the same state.
 */
import { writable } from "svelte/store";

export const settingsDirty = writable(false);

/** A form is dirty when its current serialized payload differs from the baseline. */
export function isDirty(baseline: string, current: string): boolean {
  return baseline !== current;
}
