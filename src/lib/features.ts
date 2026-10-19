/**
 * Feature-flag registry (shared by client and server).
 *
 * One declaration per flag, so the `/settings/features` page, the server-side
 * OpenFeature evaluation (`#lib/server/flags`), and the cookie store all agree.
 * Flag values are per-browser: a browser stores an override in a single cookie
 * ({@link FEATURES_COOKIE}); the effective value is the override, else the
 * instance default (the environment, else {@link FeatureFlag.default}).
 *
 * Dependency-free so it can be imported from `.svelte` files and `bun test`.
 */

export interface FeatureFlag {
  /** Stable flag key, also the OpenFeature key. */
  key: string;
  /** Human name shown in the Features settings list. */
  name: string;
  description: string;
  /** Default when neither the environment nor the browser has an opinion. */
  default: boolean;
  /** Short label for the off state, shown next to the toggle. */
  offLabel: string;
  /** Short label for the on state, shown next to the toggle. */
  onLabel: string;
}

/** Flag key for internal work notes in the issue inspector. */
export const WORK_NOTES_FLAG = "work-notes";
/** Flag key for the issue attachment dropbox. */
export const ATTACHMENTS_FLAG = "attachments";

export const FEATURE_FLAGS: FeatureFlag[] = [
  {
    key: "comment-bubbles",
    name: "Chat-style comments",
    description: "Render issue comments as chat bubbles instead of a dense list.",
    default: false,
    offLabel: "Compact list",
    onLabel: "Chat bubbles",
  },
  {
    key: WORK_NOTES_FLAG,
    name: "Internal work notes",
    description:
      "Show the internal journal in the issue inspector, alongside GitHub comments.",
    default: true,
    offLabel: "Hidden",
    onLabel: "Visible",
  },
  {
    key: ATTACHMENTS_FLAG,
    name: "Attachment dropbox",
    description: "Upload files to an issue and list them in the inspector.",
    default: true,
    offLabel: "Hidden",
    onLabel: "Visible",
  },
];

/** Cookie holding this browser's flag overrides, as a JSON object. */
export const FEATURES_COOKIE = "funnel:features";

/** Flags asked for by a browser, restricted to known keys with boolean values. */
export type FeatureOverrides = Record<string, boolean>;

/**
 * Parse a {@link FEATURES_COOKIE} value into overrides. Unknown keys and
 * non-boolean values are dropped, and malformed input degrades to `{}` so a
 * stale or tampered cookie can never break a request.
 */
export function parseFeatureOverrides(
  value: string | null | undefined,
): FeatureOverrides {
  if (!value) return {};

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Not percent-encoded; parse as-is.
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const known = new Set(FEATURE_FLAGS.map((flag) => flag.key));
  const overrides: FeatureOverrides = {};
  for (const [key, flagValue] of Object.entries(parsed)) {
    if (known.has(key) && typeof flagValue === "boolean") {
      overrides[key] = flagValue;
    }
  }
  return overrides;
}

/** Serialize overrides for storage in {@link FEATURES_COOKIE}. */
export function serializeFeatureOverrides(overrides: FeatureOverrides): string {
  return JSON.stringify(overrides);
}
