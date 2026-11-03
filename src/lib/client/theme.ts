/**
 * Client-side theme controller (System / Dark / Light).
 *
 * The pre-paint script in `src/app.html` sets `data-bs-theme` before the first
 * paint; this module owns every subsequent change, persists the choice to
 * `localStorage` under `funnel:theme`, keeps a `system` choice in sync with
 * the OS, and updates the browser theme-color to the active canvas.
 *
 * Bootstrap components and every application-facing CSS variable read
 * `data-bs-theme`; there is no second theme attribute.
 */
import { get, writable } from "svelte/store";

export type ThemeChoice = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "funnel:theme";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function systemTheme(): ResolvedTheme {
  if (!isBrowser()) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStored(): ThemeChoice {
  if (!isBrowser()) return "system";
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "dark" || value === "light" || value === "system" ? value : "system";
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  return choice === "system" ? systemTheme() : choice;
}

function apply(theme: ResolvedTheme): void {
  if (!isBrowser()) return;
  const root = document.documentElement;
  root.setAttribute("data-bs-theme", theme);
  root.style.colorScheme = theme;

  // Read the active Bootstrap canvas rather than hard-coding a value.
  const canvas = getComputedStyle(root).getPropertyValue("--bs-body-bg").trim();
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta && canvas) meta.content = canvas;
}

/** The user's chosen preference (what the switcher highlights). */
export const themeChoice = writable<ThemeChoice>(readStored());

/** The concrete theme currently painted (`dark` | `light`). */
export const resolvedTheme = writable<ResolvedTheme>(resolve(get(themeChoice)));

/** Update the theme, persist it, and repaint. */
export function setTheme(choice: ThemeChoice): void {
  themeChoice.set(choice);
  const theme = resolve(choice);
  resolvedTheme.set(theme);
  apply(theme);
  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Private-mode / storage-disabled: the in-memory choice still applies.
    }
  }
}

/**
 * Wire up cross-tab storage events and OS theme changes. Call once from the
 * root layout's `onMount`. Returns a cleanup function.
 */
export function initTheme(): () => void {
  if (!isBrowser()) return () => {};

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMediaChange = () => {
    if (get(themeChoice) === "system") {
      const theme = resolve("system");
      resolvedTheme.set(theme);
      apply(theme);
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    const next = readStored();
    themeChoice.set(next);
    const theme = resolve(next);
    resolvedTheme.set(theme);
    apply(theme);
  };

  media.addEventListener("change", onMediaChange);
  window.addEventListener("storage", onStorage);

  // Re-assert on mount in case the inline script was stripped.
  const theme = resolve(get(themeChoice));
  resolvedTheme.set(theme);
  apply(theme);

  return () => {
    media.removeEventListener("change", onMediaChange);
    window.removeEventListener("storage", onStorage);
  };
}
