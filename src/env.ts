import { defineEnvVars } from "@sveltejs/kit/env";
import { building } from "$app/env";
import * as v from "valibot";

/**
 * `vite build` imports the server graph to analyse routes, so runtime-only
 * secrets are evaluated with no environment present. Accept a throwaway value
 * while building; at runtime `building` is false and the real validation runs.
 * A string (not `undefined`) keeps the inferred type `string` and lets modules
 * that derive keys at import time — `src/lib/server/crypto/secrets.ts` — load.
 */
const BUILD_ONLY_SECRET = "build-only-placeholder-not-used-at-runtime";

export const variables = defineEnvVars({
  FUNNEL_URL: {
    description: "The URL where Funnel is hosted.",
    schema: v.optional(
      v.pipe(
        v.string(),
        v.trim(),
        // Transform empty strings (FUNNEL_URL="") to undefined before URL validation
        v.transform((val) => (val === "" ? undefined : val)),
        v.optional(
          v.pipe(v.string(), v.url("Must be a valid HTTP/HTTPS URL.")),
        ),
      ),
    ),
  },
  FUNNEL_SECRET: {
    description:
      "The secret used to encrypt sensitive data (32-byte hex or base64 recommended).",
    schema: building
      ? v.optional(v.string(), BUILD_ONLY_SECRET)
      : v.pipe(
          v.string(),
          v.trim(),
          v.minLength(32, "Encryption secret must be at least 32 characters."),
        ),
  },
  FUNNEL_DB: {
    description: "Path to the SQLite database file.",
    schema: v.optional(
      v.pipe(
        v.string(),
        v.trim(),
        v.nonEmpty("DB path cannot be empty."),
      ),
      "./data/funnel.db",
    ),
  },
  GITHUB_URL: {
    description:
      "Base URL of the GitHub web host. Set to your enterprise host (e.g. https://acme.ghe.com) for GitHub Enterprise Server.",
    schema: v.optional(
      v.pipe(
        v.string(),
        v.trim(),
        v.url("Must be a valid HTTP/HTTPS URL."),
      ),
      "https://github.com",
    ),
  },
  GITHUB_API_URL: {
    description:
      "Base URL of the GitHub API. Set to your enterprise API (e.g. https://acme.ghe.com/api/v3) for GitHub Enterprise Server.",
    schema: v.optional(
      v.pipe(
        v.string(),
        v.trim(),
        v.url("Must be a valid HTTP/HTTPS URL."),
      ),
      "https://api.github.com",
    ),
  },

  FUNNEL_UPLOAD_DIR: {
    description:
      "Directory where issue attachments (the Inspector dropbox) are stored.",
    schema: v.optional(
      v.pipe(v.string(), v.trim(), v.nonEmpty("Upload dir cannot be empty.")),
      "./data/uploads",
    ),
  },
  FUNNEL_UPLOAD_MAX_BYTES: {
    description:
      "Maximum size of a single uploaded attachment, in bytes. Raise BODY_SIZE_LIMIT to match.",
    schema: v.optional(
      v.pipe(
        v.string(),
        v.trim(),
        v.regex(/^\d+$/, "Upload limit must be a whole number of bytes."),
      ),
      String(10 * 1024 * 1024),
    ),
  },

  FUNNEL_COMMENT_UI: {
    description:
      "Default issue-comment rendering: 'compact' (dense list) or 'bubbles' (chat-style). Browsers can override it per browser in Settings > Features.",
    schema: v.optional(
      v.pipe(
        v.string(),
        v.trim(),
        v.toLowerCase(),
        v.picklist(["compact", "bubbles"]),
      ),
      "compact",
    ),
  },

  FUNNEL_ONBOARDING_TOKEN: {
    description:
      "Optional one-time token gating the first-run /onboarding wizard. Leave unset to allow anyone who can reach a fresh instance to claim it.",
    schema: v.optional(
      v.pipe(
        v.string(),
        v.trim(),
        v.transform((val) => (val === "" ? undefined : val)),
      ),
    ),
  },

  LOG_LEVEL: {
    description: "Application logging verbosity level.",
    schema: v.optional(
      v.pipe(
        v.string(),
        v.trim(),
        v.toLowerCase(),
        v.picklist([
          "fatal",
          "error",
          "warn",
          "info",
          "debug",
          "trace",
          "silent",
        ]),
      ),
      "info",
    ),
  },
});
