/**
 * Server-side feature flags, evaluated with OpenFeature.
 *
 * The provider is an in-process `TypedInMemoryProvider`, so there is no flag
 * service to run: its `contextEvaluator` reads the effective per-flag values
 * the caller passes for the request. The registry in `#lib/features` defines
 * every flag; {@link resolveFeatures} layers the browser's cookie overrides
 * (`FEATURES_COOKIE`) over the instance defaults and returns the resolved map.
 *
 * Layering: browser override → instance default (`flagDefault`, from the
 * environment) → {@link FeatureFlag.default}. Swapping to a hosted provider
 * later (flagd, GO Feature Flag, …) is a one-line change to `setProvider`.
 */
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";
import { FUNNEL_COMMENT_UI } from "$app/env/private";
import { FEATURE_FLAGS, type FeatureOverrides } from "#lib/features";

/** Flag key for the chat-style comment thread. */
export const COMMENT_BUBBLES_FLAG = "comment-bubbles";

/** Context key the evaluators read: the resolved per-flag values. */
export const FEATURES_CONTEXT_KEY = "features";

const configuration = Object.fromEntries(
  FEATURE_FLAGS.map((flag) => [
    flag.key,
    {
      variants: { on: true, off: false },
      disabled: false,
      defaultVariant: flag.default ? "on" : "off",
      contextEvaluator: (context: Record<string, unknown>) => {
        const values = context[FEATURES_CONTEXT_KEY] as
          | FeatureOverrides
          | undefined;
        return values?.[flag.key] ? "on" : "off";
      },
    },
  ]),
);

OpenFeature.setProvider(new TypedInMemoryProvider(configuration as never));

const client = OpenFeature.getClient();

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
  const values = Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [
      flag.key,
      overrides[flag.key] ?? flagDefault(flag.key),
    ]),
  );

  const entries = await Promise.all(
    FEATURE_FLAGS.map(
      async (flag) =>
        [
          flag.key,
          await client.getBooleanValue(flag.key, flag.default, {
            [FEATURES_CONTEXT_KEY]: values,
          }),
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}
