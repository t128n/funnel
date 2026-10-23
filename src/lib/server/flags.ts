/**
 * Server-side feature flags.
 *
 * The registry in `#lib/features` defines every flag; {@link resolveFeatures}
 * layers the browser's cookie overrides (`FEATURES_COOKIE`) over the instance
 * defaults and returns the resolved map.
 *
 * Layering: browser override → instance default (`flagDefault`, from the
 * environment) → {@link FeatureFlag.default}. Resolution is direct, with no
 * external flag service and no network call.
 */
import { FUNNEL_COMMENT_UI } from "$app/env/private";
import { FEATURE_FLAGS, type FeatureOverrides } from "#lib/features";

/** Flag key for the chat-style comment thread. */
export const COMMENT_BUBBLES_FLAG = "comment-bubbles";

/** The instance default for a flag: the environment, else the registry default. */
export function flagDefault(key: string): boolean {
  if (key === COMMENT_BUBBLES_FLAG) return FUNNEL_COMMENT_UI === "bubbles";
  return FEATURE_FLAGS.find((flag) => flag.key === key)?.default ?? false;
}

/**
 * Resolve every flag for a request: browser overrides first, then the instance
 * defaults. The result is a plain `{ key: boolean }` map.
 */
export async function resolveFeatures(
  overrides: FeatureOverrides = {},
): Promise<Record<string, boolean>> {
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [
      flag.key,
      overrides[flag.key] ?? flagDefault(flag.key),
    ]),
  );
}
