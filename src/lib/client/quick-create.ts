/**
 * Open state for the in-app quick-create issue dialog.
 *
 * The global `C` shortcut and the board columns both open the same dialog, so
 * they share one store. Board columns pass their workflow status as a prefill;
 * the dialog itself owns the form, the write, and the refreshed feeds.
 *
 * A plain Svelte store rather than runes so the prefill rules can be exercised
 * under `bun test` without the Svelte compiler.
 */
import { writable } from "svelte/store";
import { STATUS_OPTIONS } from "#lib/labels";

/** Optional context supplied by the surface that opened the dialog. */
export interface QuickCreatePrefill {
  /** `owner/name`; defaults to the instance's default repository. */
  repo?: string;
  /** Logical open status (`backlog`, `todo`, `in-progress`, `in-review`). */
  status?: string;
}

/** The created issue, kept after the dialog closes for the confirmation. */
export interface QuickCreateSuccess {
  repo: string;
  number: number;
  htmlUrl: string;
}

export interface QuickCreateState {
  open: boolean;
  prefill: QuickCreatePrefill;
  success: QuickCreateSuccess | null;
}

const OPEN_STATUSES = new Set(STATUS_OPTIONS.map((option) => option.value));

/**
 * Keep only prefills the API accepts. `Done` is a closed window, not a status
 * label, and an unknown/blank repo is left to the dialog's default.
 */
export function normalizeQuickCreatePrefill(
  prefill: QuickCreatePrefill = {},
): QuickCreatePrefill {
  const repo = prefill.repo?.trim();
  const status = prefill.status?.trim();
  return {
    ...(repo ? { repo } : {}),
    ...(status && OPEN_STATUSES.has(status) ? { status } : {}),
  };
}

const INITIAL: QuickCreateState = { open: false, prefill: {}, success: null };

export const quickCreate = writable<QuickCreateState>({ ...INITIAL });

/** Open the dialog, optionally prefilled from the surface that triggered it. */
export function openQuickCreate(prefill: QuickCreatePrefill = {}): void {
  quickCreate.set({
    open: true,
    prefill: normalizeQuickCreatePrefill(prefill),
    success: null,
  });
}

export function closeQuickCreate(): void {
  quickCreate.update((state) => (state.open ? { ...state, open: false } : state));
}

/**
 * Record a successful create and close the dialog. The app layout renders the
 * confirmation (including the GitHub link) from this value.
 */
export function reportQuickCreateSuccess(success: QuickCreateSuccess): void {
  quickCreate.set({ open: false, prefill: {}, success });
}

export function dismissQuickCreateSuccess(): void {
  quickCreate.update((state) =>
    state.success === null ? state : { ...state, success: null },
  );
}

/** Restore the initial state; used by tests and a fresh sign-in. */
export function resetQuickCreate(): void {
  quickCreate.set({ ...INITIAL });
}
