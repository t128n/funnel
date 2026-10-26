import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose class names, letting the last conflicting utility win.
 *
 * Primitive wrappers ship their visual contract in `class`; call sites add
 * layout and may override a default (`cn("rounded-sm", "rounded-none")`).
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

export type { ClassValue };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
