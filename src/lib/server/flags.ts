/**
 * Server-side feature flags, evaluated with OpenFeature.
 *
 * The provider is an in-process `TypedInMemoryProvider`, so there is no flag
 * service to run: its `contextEvaluator` reads request-scoped context that the
 * caller passes to `getBooleanValue`. The comment UI flag is targeted that way
 * — the layout load forwards the viewer's cookie (or the `FUNNEL_COMMENT_UI`
 * default) as `commentUi` — which keeps evaluation per-request without a
 * global mutable provider state.
 *
 * Swapping to a hosted provider later (flagd, GO Feature Flag, …) is a
 * one-line change to `setProvider` here; call sites keep using
 * {@link commentBubbles}.
 */
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import type { CommentUi } from "#lib/comment-ui";

/** Flag key for the chat-style comment thread. */
export const COMMENT_BUBBLES_FLAG = "comment-bubbles";

/** Context key the flag's `contextEvaluator` reads. */
export const COMMENT_UI_CONTEXT_KEY = "commentUi";

const configuration = {
  [COMMENT_BUBBLES_FLAG]: {
    variants: { on: true, off: false },
    disabled: false,
    defaultVariant: "off",
    contextEvaluator: (context: Record<string, unknown>) =>
      context[COMMENT_UI_CONTEXT_KEY] === "bubbles" ? "on" : "off",
  },
} as const;

OpenFeature.setProvider(new TypedInMemoryProvider(configuration));

const client = OpenFeature.getClient();

/** Resolve whether issue comments render as chat bubbles for this request. */
export function commentBubbles(commentUi: CommentUi | null): Promise<boolean> {
  return client.getBooleanValue(COMMENT_BUBBLES_FLAG, false, {
    [COMMENT_UI_CONTEXT_KEY]: commentUi ?? "compact",
  });
}
