/**
 * Server-side prefill decoding for `GET /intake`.
 *
 * Prefers the compact deeplink param (`?d=`) produced by the submit page and
 * falls back to the plain `title`/`body`/`source` params, so hand-written links
 * keep working. Kept server-only so `node:zlib` never reaches the client
 * bundle; the browser side lives in `#lib/client/intake-deeplink`.
 */
import { inflateRawSync } from "node:zlib";
import {
  clampSubmitPrefill,
  INTAKE_BODY_MAX,
  INTAKE_DEEPLINK_MAX,
  readSubmitPrefill,
  type SubmitPrefill,
} from "#lib/intake-prefill";

/** Refuse to even attempt decoding a link longer than we would ever produce. */
const MAX_ENCODED_LENGTH = INTAKE_DEEPLINK_MAX;

/**
 * Cap the inflated size too: a short base64 string can expand to gigabytes
 * otherwise. The extra headroom covers the JSON keys and escaping.
 */
const MAX_INFLATED_BYTES = INTAKE_BODY_MAX + 8_192;

export function readSubmissionPrefill(params: URLSearchParams): SubmitPrefill {
  const encoded = params.get("d");
  if (encoded && encoded.length <= MAX_ENCODED_LENGTH) {
    const decoded = decodeDeeplink(encoded);
    if (decoded) return decoded;
  }

  return readSubmitPrefill(params);
}

/** Decode `base64url(deflate-raw(JSON))`; `null` on any malformed input. */
function decodeDeeplink(encoded: string): SubmitPrefill | null {
  try {
    const inflated = inflateRawSync(Buffer.from(encoded, "base64url"), {
      maxOutputLength: MAX_INFLATED_BYTES,
    }).toString("utf8");
    const parsed: unknown = JSON.parse(inflated);
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    return clampSubmitPrefill({
      title: typeof record.t === "string" ? record.t : "",
      body: typeof record.b === "string" ? record.b : "",
      source: typeof record.s === "string" ? record.s : "",
    });
  } catch {
    return null;
  }
}
