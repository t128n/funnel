/**
 * Saved-view API (issue #26).
 *
 * `GET` lists the signed-in user's own plus every shared view, so any `read`
 * session can open a saved URL. `POST`, `PATCH` and `DELETE` require `write`;
 * the service additionally enforces ownership, letting only the owner (or an
 * admin, for a shared view) rename, repin, reassign sharing or delete it.
 *
 * These routes touch only `state_saved_view`: a view never changes an issue,
 * a label or the mirror, and opening one is always a normal client navigation.
 */
import type { RequestHandler } from "./$types";
import { apiRole, apiSession } from "#lib/server/http/session";
import { outcomeResponse } from "#lib/server/http/outcome";
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  updateSavedView,
  type SavedViewActor,
} from "#lib/server/saved-views";

function actor(locals: App.Locals): SavedViewActor {
  const user = locals.user;
  return {
    id: user?.id ?? "",
    role: (user as { role?: unknown } | null)?.role,
  };
}

function badRequest(message = "Invalid JSON body"): Response {
  return Response.json({ message }, { status: 400 });
}

async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const GET: RequestHandler = ({ locals }) => {
  const userId = apiSession(locals);
  if (userId instanceof Response) return userId;
  return Response.json({ views: listSavedViews(userId) });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const userId = apiRole(locals, "write");
  if (userId instanceof Response) return userId;

  const body = await readObject(request);
  if (body === null) return badRequest();

  const result = createSavedView(actor(locals), {
    name: typeof body.name === "string" ? body.name : "",
    query: typeof body.query === "string" ? body.query : "",
    scope: typeof body.scope === "string" ? body.scope : "",
    sort: typeof body.sort === "string" ? body.sort : null,
    direction: typeof body.direction === "string" ? body.direction : null,
    group: typeof body.group === "string" ? body.group : null,
    shared: body.shared === true,
    pinned: body.pinned === true,
  });
  return outcomeResponse(result, 201);
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
  const userId = apiRole(locals, "write");
  if (userId instanceof Response) return userId;

  const body = await readObject(request);
  if (body === null) return badRequest();
  if (typeof body.id !== "string" || body.id.trim().length === 0) {
    return badRequest("Missing view id");
  }

  // Only fields present in the body are changed; `undefined` means "keep".
  const result = updateSavedView(actor(locals), body.id, {
    ...(typeof body.name === "string" ? { name: body.name } : {}),
    ...(typeof body.query === "string" ? { query: body.query } : {}),
    ...(typeof body.scope === "string" ? { scope: body.scope } : {}),
    ...(body.sort === null || typeof body.sort === "string"
      ? { sort: body.sort as string | null }
      : {}),
    ...(body.direction === null || typeof body.direction === "string"
      ? { direction: body.direction as string | null }
      : {}),
    ...(body.group === null || typeof body.group === "string"
      ? { group: body.group as string | null }
      : {}),
    ...(typeof body.shared === "boolean" ? { shared: body.shared } : {}),
    ...(typeof body.pinned === "boolean" ? { pinned: body.pinned } : {}),
  });
  return outcomeResponse(result);
};

export const DELETE: RequestHandler = ({ url, locals }) => {
  const userId = apiRole(locals, "write");
  if (userId instanceof Response) return userId;

  const id = (url.searchParams.get("id") ?? "").trim();
  if (id.length === 0) return badRequest("Missing view id");
  return outcomeResponse(deleteSavedView(actor(locals), id));
};
