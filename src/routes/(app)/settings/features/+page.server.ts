import { FEATURES_COOKIE, FEATURE_FLAGS, parseFeatureOverrides } from "#lib/features";
import { flagDefault } from "#lib/server/flags";
import type { PageServerLoad } from "./$types";

/**
 * Feature flags are per-browser: the page needs the instance defaults (from the
 * environment / registry) and this browser's overrides. Effective value is
 * `overrides[key] ?? defaults[key]`.
 */
export const load: PageServerLoad = ({ cookies }) => ({
  defaults: Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [flag.key, flagDefault(flag.key)]),
  ),
  overrides: parseFeatureOverrides(cookies.get(FEATURES_COOKIE)),
});
