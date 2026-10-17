/**
 * Shared result envelope for transport-agnostic server actions.
 *
 * Funnel's write layer (intake triage decisions, issue mutations) never throws
 * for expected failures: a GitHub rejection, a missing local row, or a bad
 * request is returned as `{ ok: false, status, message }` so a SvelteKit route
 * can map it straight onto an HTTP response. `status` is GitHub's own status
 * where the failure came from upstream, else 400/404/502.
 */

/** A value or an HTTP-shaped failure the caller can surface. */
export type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string };

/** Extract an HTTP status from an Octokit/`fetch` error, defaulting to 502. */
export function errorStatus(error: unknown): number {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return 502;
}

/** Human-readable message from an unknown thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Map an `Outcome` onto a JSON `Response` (2xx on success, else the failure). */
export function outcomeResponse<T>(
  result: Outcome<T>,
  successStatus = 200,
): Response {
  if (result.ok) {
    return Response.json(result.value, { status: successStatus });
  }
  return Response.json({ message: result.message }, { status: result.status });
}
