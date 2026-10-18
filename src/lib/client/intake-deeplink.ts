/**
 * Client-side deeplink encoder for the submit page.
 *
 * Turns the composer's current values into a query string that reopens the same
 * draft. Payloads are `base64url(deflate-raw(JSON))` under a short `d` key; the
 * plain `title`/`body`/`source` params remain the fallback whenever compression
 * is unavailable or would make the link longer.
 *
 * Deliberately free of `window` so it can be exercised in tests; the caller
 * attaches the result to the current origin.
 */
import { clampSubmitPrefill, INTAKE_DEEPLINK_MAX, type SubmitPrefill } from "#lib/intake-prefill";

/** Short JSON keys keep the uncompressed fallback compact. */
interface DeeplinkPayload {
  t?: string;
  b?: string;
  s?: string;
}

/**
 * Build the query string for the current values. Returns `null` when there is
 * nothing to share or the result would be too long to copy safely.
 */
export async function encodeSubmitDeeplinkQuery(input: SubmitPrefill): Promise<string | null> {
  const prefill = clampSubmitPrefill(input);
  if (!prefill.title && !prefill.body && !prefill.source) return null;

  const payload: DeeplinkPayload = {};
  if (prefill.title) payload.t = prefill.title;
  if (prefill.body) payload.b = prefill.body;
  if (prefill.source) payload.s = prefill.source;

  const plain = plainQuery(prefill);
  const compressed = await compressedQuery(JSON.stringify(payload));
  // Compression only wins on larger drafts, so never produce a longer link.
  const query = compressed && compressed.length < plain.length ? compressed : plain;

  return query.length <= INTAKE_DEEPLINK_MAX ? query : null;
}

function plainQuery(prefill: SubmitPrefill): string {
  const params = new URLSearchParams();
  if (prefill.title) params.set("title", prefill.title);
  if (prefill.body) params.set("body", prefill.body);
  if (prefill.source) params.set("source", prefill.source);
  return params.toString();
}

async function compressedQuery(json: string): Promise<string | null> {
  if (typeof CompressionStream === "undefined") return null;

  try {
    const stream = new Blob([new TextEncoder().encode(json)])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    return `d=${toBase64Url(bytes)}`;
  } catch {
    return null;
  }
}

/** `btoa` in chunks so long bodies never overflow the call stack. */
function toBase64Url(bytes: Uint8Array): string {
  const chunkSize = 0x2000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
