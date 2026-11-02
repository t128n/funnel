import { writable } from "svelte/store";

/**
 * One in-flow status region for failures that have no local owner (for
 * example a row-level quick action). It renders under the app bar, persists
 * until dismissed or replaced, and is announced politely. This replaces
 * floating toasts for user-initiated writes.
 */
export interface AppStatus {
  tone: "error" | "warning" | "success" | "info";
  message: string;
}

export const appStatus = writable<AppStatus | null>(null);

export function setAppStatus(tone: AppStatus["tone"], message: string): void {
  appStatus.set({ tone, message });
}

export function clearAppStatus(): void {
  appStatus.set(null);
}

/** Surface a write failure without a floating notification. */
export function notifyFailure(title: string, description?: string): void {
  appStatus.set({
    tone: "error",
    message: description ? `${title}. ${description}` : title
  });
}
