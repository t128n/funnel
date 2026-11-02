import { createCn } from "cn/config";

/**
 * Class merge configured for Funnel's t128n type utilities.
 *
 * `text-body`, `text-caption`, `text-heading-*` and `text-mono` are font sizes,
 * not colours. Without this, tailwind-merge treats them as `text-*` colour
 * classes and drops them whenever a real colour such as `text-fg` follows.
 */
export const cn = createCn({
	extend: {
		classGroups: {
			"font-size": [
				{
					text: [
						"caption",
						"body",
						"body-content",
						"heading-sm",
						"heading-md",
						"heading-lg",
						"mono"
					]
				}
			]
		}
	}
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { child?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
