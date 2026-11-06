/**
 * The manifest-flow cookie carries both the CSRF `state` and the GitHub host
 * the user selected in the wizard. The host must survive the round-trip to
 * GitHub because the conversion callback runs before any App credentials exist
 * and therefore cannot read the host from the credential row.
 *
 * The payload is sealed with an HMAC keyed by `FUNNEL_SECRET`: the callback uses
 * the embedded API URL for a server-side fetch, so an unsigned cookie would let
 * anyone who can set it point that fetch at an arbitrary host.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { FUNNEL_SECRET } from "$app/env/private";
import type { GithubHosts } from "#lib/server/github/hosts";

/** What the onboarding manifest cookie stores. */
export interface ManifestState {
  state: string;
  github: GithubHosts;
}

function sign(body: string): string {
  return createHmac("sha256", FUNNEL_SECRET).update(body).digest("base64url");
}

/** Serialize and sign the manifest round-trip payload. */
export function sealManifestState(payload: ManifestState): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${body}.${sign(body)}`;
}

/** Verify and decode a cookie, returning `null` for tampered or old values. */
export function unsealManifestState(raw: string): ManifestState | null {
  const [body, signature, ...rest] = raw.split(".");
  if (!body || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(body));
  const provided = Buffer.from(signature);
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as {
    state?: unknown;
    github?: { url?: unknown; api_url?: unknown };
  };
  if (
    typeof candidate.state !== "string" ||
    typeof candidate.github?.url !== "string" ||
    typeof candidate.github.api_url !== "string"
  ) {
    return null;
  }

  return {
    state: candidate.state,
    github: {
      url: candidate.github.url,
      api_url: candidate.github.api_url,
    },
  };
}
