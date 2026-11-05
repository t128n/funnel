/**
 * HTTP glue for the issue write endpoints (SPEC §8, §7.2).
 *
 * Writes execute with the signed-in user's token; the background sync/label
 * paths use the GitHub App installation token. Each successful write schedules
 * an immediate single-issue refresh so the local mirror (and every SSE client)
 * catches up without the response waiting on it.
 */
import { getUserAccessToken } from "#lib/server/auth/index";
import {
  forge,
  type GitHubProvider,
} from "#lib/server/forge/providers.server";
import { errorMessage } from "#lib/server/http/outcome";
import { apiRole } from "#lib/server/http/session";
import { createLogger, errorFields } from "#lib/server/log";
import { isDemoMode } from "#lib/server/demo/mode";
import { refreshIssue } from "#lib/server/sync/worker";

const log = createLogger({ component: "issues-api" });

export type AuthResult =
  | { ok: true; userId: string; provider: GitHubProvider }
  | { ok: false; response: Response };

function jsonError(message: string, status: number): Response {
  return Response.json({ message }, { status });
}

/**
 * Resolve a user-token provider from the session's user id. Returns a ready
 * error `Response` (401/502) when the request is unauthenticated or the token
 * cannot be resolved.
 */
export async function authenticate(
  userId: string | undefined | null,
): Promise<AuthResult> {
  if (!userId) {
    return { ok: false, response: jsonError("Not authenticated", 401) };
  }
  try {
    const token = await getUserAccessToken(userId);
    return { ok: true, userId, provider: forge.userProvider(token) };
  } catch (error) {
    log.warn(errorFields(error), "user token unavailable");
    return { ok: false, response: jsonError(errorMessage(error), 502) };
  }
}

/**
 * Resolve a user-token provider for a write request. The session must hold the
 * `write` role and a usable token; either failure returns a ready `Response`
 * (401/403/502) with the same status and body as the inline guards.
 */
export async function authenticateWrite(
  locals: App.Locals,
): Promise<AuthResult> {
  const userId = apiRole(locals, "write");
  if (userId instanceof Response) return { ok: false, response: userId };
  return authenticate(userId);
}

/** Parse a positive integer issue number, returning a 400 `Response` otherwise. */
export function issueNumberParam(value: string | undefined): number | Response {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    return jsonError("Invalid issue number", 400);
  }
  return number;
}

/**
 * Fire-and-forget single-issue refresh (SPEC §7.2). The write response has
 * already been sent; failures are logged and left for the next poll or nightly
 * reconciliation to repair.
 */
export function scheduleRefresh(
  owner: string,
  repo: string,
  number: number,
  actorUserId?: string,
): void {
  // Demo writes already landed in the mirror through `demoProvider`; a refresh
  // would call GitHub for data that can never exist there.
  if (isDemoMode()) return;
  void refreshIssue(owner, repo, number, actorUserId).catch((error) => {
    log.warn(
      { repo: `${owner}/${repo}`, number, ...errorFields(error) },
      "post-write refresh failed",
    );
  });
}

/** Parse a JSON request body, returning a 400 `Response` on malformed input. */
export async function readJson(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: jsonError("Request body must be valid JSON", 400),
    };
  }
}
