import { defineEnvVars } from "@sveltejs/kit/env";
import * as v from "valibot";

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
    schema: v.pipe(
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

  GITHUB_APP_ID: {
    description: "The GitHub App ID.",
    schema: v.pipe(
      v.string(),
      v.trim(),
      v.nonEmpty("GitHub App ID cannot be empty."),
      v.digits("GitHub App ID must contain only digits."),
    ),
  },
  GITHUB_APP_PRIVATE_KEY: {
    description: "The PEM-encoded RSA private key for the GitHub App.",
    schema: v.pipe(
      v.string(),
      v.trim(),
      // Convert escaped newlines from CI/Docker env injectors into actual line breaks
      v.transform((key) => key.replace(/\\n/g, "\n")),
      v.startsWith("-----BEGIN ", "Private key must have a valid PEM header."),
      v.includes(
        "PRIVATE KEY-----",
        "Private key must be a valid PEM private key.",
      ),
    ),
  },
  GITHUB_CLIENT_ID: {
    description: "The GitHub App Client ID.",
    schema: v.pipe(
      v.string(),
      v.trim(),
      v.regex(
        /^(Iv1\.[0-9a-zA-Z]+|(?:Iv|Ov)[0-9a-zA-Z]{18}|[a-f0-9]{20})$/,
        "Invalid GitHub Client ID format.",
      ),
    ),
  },
  GITHUB_CLIENT_SECRET: {
    description: "The GitHub App Client Secret.",
    schema: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(40, "GitHub Client Secret must be at least 40 characters."),
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
