/**
 * Named, shareable saved views (issue #26).
 *
 * A saved view is durable Funnel state (`state_saved_view`) that remembers a
 * URL preset: the query string, sort/direction and grouping the reader had at
 * save time. The live URL remains the runtime source of truth; opening a view
 * navigates to `/<scope>?<query>` and applies the stored sort and group, but
 * changing a filter afterwards is never auto-saved.
 *
 * Visibility is simple on purpose: personal views belong to one `auth_user.id`,
 * shared views are readable by every signed-in user. Only the owner may edit or
 * delete a view; an `admin` may additionally manage a *shared* view. Personal
 * views are never visible to anyone else, including admins.
 *
 * Nothing here touches the mirror, so create/update/delete can never affect an
 * issue, label or sync row.
 */
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateSavedView } from "#lib/server/db/schema";
import type { Outcome } from "#lib/server/http/outcome";
import { hasRole } from "#lib/roles";
import { FILTER_KEYS } from "#lib/url-filter";
import {
  isSavedViewDirection,
  isSavedViewGroup,
  isSavedViewScope,
  isSavedViewSort,
  MAX_SAVED_VIEW_NAME,
  MAX_SAVED_VIEW_QUERY,
  type SavedView,
  type SavedViewInput,
  type SavedViewPatch,
  type SavedViewScope,
  type SavedViewGroup,
} from "#lib/saved-views";
import type { IssueSort, SortDirection } from "#lib/url-filter";

/** Caller identity and role used for ownership checks. */
export interface SavedViewActor {
  id: string;
  role?: unknown;
}

type SavedViewRow = typeof stateSavedView.$inferSelect;

/** Query keys a stored view may carry. `sort`/`direction` are columns. */
const ALLOWED_QUERY_KEYS = new Set<string>([...FILTER_KEYS, "snoozed"]);

interface ValidatedSavedView {
  name: string;
  query: string;
  scope: SavedViewScope;
  sort: IssueSort | null;
  direction: SortDirection | null;
  group: SavedViewGroup | null;
  shared: boolean;
  pinned: boolean;
}

function toView(row: SavedViewRow): SavedView {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    query: row.query,
    scope: isSavedViewScope(row.scope) ? row.scope : "issues",
    sort: isSavedViewSort(row.sort) ? row.sort : null,
    direction: isSavedViewDirection(row.direction) ? row.direction : null,
    group: isSavedViewGroup(row.group) ? row.group : null,
    shared: row.shared === 1,
    pinned: row.pinned === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function flag(value: boolean | undefined): boolean {
  return value === true;
}

/**
 * Validate and normalize a write. The query is parsed and re-serialized so a
 * caller cannot smuggle a path, fragment, CRLF or unknown parameter into a
 * stored URL; sort/direction found in the query are promoted to their columns.
 */
export function validateSavedViewInput(
  input: SavedViewInput,
): Outcome<ValidatedSavedView> {
  if (typeof input.name !== "string") {
    return { ok: false, status: 400, message: "View name is required" };
  }
  const name = input.name.trim();
  if (name.length === 0) {
    return { ok: false, status: 400, message: "View name is required" };
  }
  if (name.length > MAX_SAVED_VIEW_NAME) {
    return {
      ok: false,
      status: 400,
      message: `View name must be at most ${MAX_SAVED_VIEW_NAME} characters`,
    };
  }

  if (!isSavedViewScope(input.scope)) {
    return {
      ok: false,
      status: 400,
      message: "View scope must be issues or inbox",
    };
  }

  if (typeof input.query !== "string") {
    return { ok: false, status: 400, message: "View query must be text" };
  }
  const rawQuery = input.query.trim().replace(/^\?/, "");
  if (rawQuery.length > MAX_SAVED_VIEW_QUERY) {
    return {
      ok: false,
      status: 400,
      message: `View query must be at most ${MAX_SAVED_VIEW_QUERY} characters`,
    };
  }
  if (/[#\r\n]/.test(rawQuery)) {
    return {
      ok: false,
      status: 400,
      message: "View query must not contain a fragment or newline",
    };
  }

  const params = new URLSearchParams(rawQuery);
  const sortFromQuery = params.get("sort");
  const directionFromQuery = params.get("direction");
  params.delete("sort");
  params.delete("direction");

  for (const [key, value] of params) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      return {
        ok: false,
        status: 400,
        message: `Unsupported view query parameter: ${key}`,
      };
    }
    if (key === "snoozed" && value !== "0" && value !== "1") {
      return {
        ok: false,
        status: 400,
        message: "snoozed must be 0 or 1",
      };
    }
  }

  const sort = input.sort !== undefined ? input.sort : sortFromQuery;
  if (sort !== null && sort !== undefined && !isSavedViewSort(sort)) {
    return { ok: false, status: 400, message: "Invalid view sort" };
  }
  const direction =
    input.direction !== undefined ? input.direction : directionFromQuery;
  if (
    direction !== null &&
    direction !== undefined &&
    !isSavedViewDirection(direction)
  ) {
    return { ok: false, status: 400, message: "Invalid view direction" };
  }
  if (
    input.group !== null &&
    input.group !== undefined &&
    !isSavedViewGroup(input.group)
  ) {
    return { ok: false, status: 400, message: "Invalid view group" };
  }

  return {
    ok: true,
    value: {
      name,
      query: params.toString(),
      scope: input.scope,
      sort: (sort ?? null) as IssueSort | null,
      direction: (direction ?? null) as SortDirection | null,
      group: (input.group ?? null) as SavedViewGroup | null,
      shared: flag(input.shared),
      pinned: flag(input.pinned),
    },
  };
}

/** True when `actor` may edit or delete `view`. */
export function canManageSavedView(
  view: Pick<SavedView, "ownerUserId" | "shared">,
  actor: SavedViewActor,
): boolean {
  if (view.ownerUserId === actor.id) return true;
  return view.shared && hasRole(actor.role, "admin");
}

/** One visible saved view, regardless of scope. */
export function getSavedView(id: string): SavedView | undefined {
  const row = db
    .select()
    .from(stateSavedView)
    .where(eq(stateSavedView.id, id))
    .get();
  return row ? toView(row) : undefined;
}

/**
 * Every view the user may open: their own plus every shared view, pinned
 * first, then own before shared, then case-insensitive name. Scope filtering
 * happens in the switcher so the API serves one consistent list.
 */
export function listSavedViews(userId: string): SavedView[] {
  return db
    .select()
    .from(stateSavedView)
    .where(
      sql`${stateSavedView.ownerUserId} = ${userId} OR ${stateSavedView.shared} = 1`,
    )
    .orderBy(
      desc(stateSavedView.pinned),
      sql`CASE WHEN ${stateSavedView.ownerUserId} = ${userId} THEN 0 ELSE 1 END`,
      asc(sql`lower(${stateSavedView.name})`),
    )
    .all()
    .map(toView);
}

function nameTaken(
  ownerUserId: string,
  name: string,
  excludeId?: string,
): boolean {
  const conditions = [
    eq(stateSavedView.ownerUserId, ownerUserId),
    sql`lower(${stateSavedView.name}) = lower(${name})`,
  ];
  if (excludeId !== undefined) conditions.push(ne(stateSavedView.id, excludeId));
  const row = db
    .select({ id: stateSavedView.id })
    .from(stateSavedView)
    .where(and(...conditions))
    .get();
  return row !== undefined;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /unique/i.test(error.message);
}

/** Create a view owned by `actor`. */
export function createSavedView(
  actor: SavedViewActor,
  input: SavedViewInput,
  now = Date.now(),
): Outcome<SavedView> {
  const validated = validateSavedViewInput(input);
  if (!validated.ok) return validated;

  if (nameTaken(actor.id, validated.value.name)) {
    return {
      ok: false,
      status: 409,
      message: "A saved view with that name already exists",
    };
  }

  const row: SavedViewRow = {
    id: crypto.randomUUID(),
    ownerUserId: actor.id,
    ...validated.value,
    shared: validated.value.shared ? 1 : 0,
    pinned: validated.value.pinned ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    db.insert(stateSavedView).values(row).run();
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        status: 409,
        message: "A saved view with that name already exists",
      };
    }
    throw error;
  }
  return { ok: true, value: toView(row) };
}

/**
 * Update a view's name, query, flags or group. Omitted fields keep their
 * stored value, which lets pin/rename be separate small requests.
 */
export function updateSavedView(
  actor: SavedViewActor,
  id: string,
  patch: SavedViewPatch,
  now = Date.now(),
): Outcome<SavedView> {
  const current = getSavedView(id);
  if (!current) {
    return { ok: false, status: 404, message: "Saved view not found" };
  }
  if (!canManageSavedView(current, actor)) {
    return {
      ok: false,
      status: 403,
      message: "You cannot manage this saved view",
    };
  }

  const merged: SavedViewInput = {
    name: patch.name ?? current.name,
    query: patch.query ?? current.query,
    scope: patch.scope ?? current.scope,
    // An update that changes the query lets the query's sort win; otherwise
    // the stored column is carried forward. An explicit patch always wins.
    sort:
      patch.sort !== undefined
        ? patch.sort
        : patch.query !== undefined
          ? undefined
          : current.sort,
    direction:
      patch.direction !== undefined
        ? patch.direction
        : patch.query !== undefined
          ? undefined
          : current.direction,
    group: patch.group !== undefined ? patch.group : current.group,
    shared: patch.shared !== undefined ? patch.shared : current.shared,
    pinned: patch.pinned !== undefined ? patch.pinned : current.pinned,
  };
  const validated = validateSavedViewInput(merged);
  if (!validated.ok) return validated;

  if (nameTaken(actor.id, validated.value.name, id)) {
    return {
      ok: false,
      status: 409,
      message: "A saved view with that name already exists",
    };
  }

  try {
    db.update(stateSavedView)
      .set({
        name: validated.value.name,
        query: validated.value.query,
        scope: validated.value.scope,
        sort: validated.value.sort,
        direction: validated.value.direction,
        group: validated.value.group,
        shared: validated.value.shared ? 1 : 0,
        pinned: validated.value.pinned ? 1 : 0,
        updatedAt: now,
      })
      .where(eq(stateSavedView.id, id))
      .run();
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        status: 409,
        message: "A saved view with that name already exists",
      };
    }
    throw error;
  }

  return { ok: true, value: { ...current, ...validated.value, updatedAt: now } };
}

/** Delete a view. Deleting a view never touches issues or the mirror. */
export function deleteSavedView(
  actor: SavedViewActor,
  id: string,
): Outcome<{ id: string }> {
  const current = getSavedView(id);
  if (!current) {
    return { ok: false, status: 404, message: "Saved view not found" };
  }
  if (!canManageSavedView(current, actor)) {
    return {
      ok: false,
      status: 403,
      message: "You cannot manage this saved view",
    };
  }
  db.delete(stateSavedView).where(eq(stateSavedView.id, id)).run();
  return { ok: true, value: { id } };
}
