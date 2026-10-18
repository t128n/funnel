/**
 * Shared constants for the comment-rendering feature flag.
 *
 * The flag is evaluated server-side by OpenFeature (`#lib/server/flags`). This
 * module holds only the values the client and server must agree on: the cookie
 * a browser uses to override the default, and the set of valid choices the
 * sidebar switcher offers.
 */

/** Cookie that lets a single browser override the default comment rendering. */
export const COMMENT_UI_COOKIE = "funnel:comment-ui";

/** How the issue comment thread is rendered. */
export type CommentUi = "compact" | "bubbles";

/** Options for the sidebar switcher. */
export const COMMENT_UI_OPTIONS: { value: CommentUi; label: string }[] = [
  { value: "compact", label: "Compact list" },
  { value: "bubbles", label: "Chat bubbles" },
];

/** Normalize a raw cookie value to a {@link CommentUi}, or `null` when unset. */
export function parseCommentUi(
  value: string | null | undefined,
): CommentUi | null {
  return value === "compact" || value === "bubbles" ? value : null;
}
