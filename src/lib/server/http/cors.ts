/**
 * Open CORS headers for the Funnel-first intake surface (SPEC §6.1).
 *
 * `POST /api/intake` is called from third-party pages and CLIs that live on
 * other origins, so the endpoint is deliberately open (`*`) with no credential
 * allowance. Funnel is expected to sit behind enterprise network segmentation
 * (SPEC §8), which is the actual access boundary — CORS here only unblocks the
 * browser preflight. Only `Content-Type: application/json` is accepted, so the
 * request body must be a simple-request-compatible JSON payload.
 */
export const OPEN_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;
