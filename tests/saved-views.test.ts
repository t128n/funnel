import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "#lib/server/db/index";
import { stateSavedView } from "#lib/server/db/schema";
import {
  canManageSavedView,
  createSavedView,
  deleteSavedView,
  getSavedView,
  listSavedViews,
  updateSavedView,
  validateSavedViewInput,
} from "#lib/server/saved-views";
import {
  savedViewQuery,
  savedViewUrl,
  type SavedView,
} from "#lib/saved-views";
import { EMPTY_CLIENT_FILTER, parseFilterParams } from "#lib/url-filter";
import {
  DELETE as deleteRoute,
  GET as listRoute,
  PATCH as patchRoute,
  POST as createRoute,
} from "#/routes/api/saved-views/+server";

const root = join(import.meta.dir, "..");

function source(path: string): string {
  return readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
}

const ALICE = { id: "alice", role: "write" };
const BOB = { id: "bob", role: "write" };
const ADMIN = { id: "root", role: "admin" };
const READER = { id: "reader", role: "read" };

function jsonRequest(body: unknown): Request {
  return new Request("http://x/api/saved-views", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function locals(user: { id: string; role: string } | null): App.Locals {
  return { user, session: null } as unknown as App.Locals;
}

function create(
  actor: { id: string; role?: string },
  name: string,
  overrides: Partial<Parameters<typeof createSavedView>[1]> = {},
): SavedView {
  const result = createSavedView(actor, {
    name,
    query: "repo=org%2Fcore&status=todo",
    scope: "issues",
    sort: "priority",
    direction: "asc",
    group: "status",
    ...overrides,
  });
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

beforeEach(() => {
  db.delete(stateSavedView).run();
});

afterEach(() => {
  db.delete(stateSavedView).run();
});

describe("saved-view URL round trip", () => {
  test("serializes a filter without duplicating sort and direction", () => {
    const query = savedViewQuery({
      ...EMPTY_CLIENT_FILTER,
      repos: ["org/core"],
      labels: ["bug"],
      sort: "updated",
      direction: "desc",
    });
    const params = new URLSearchParams(query);
    expect(params.get("repo")).toBe("org/core");
    expect(params.get("label")).toBe("bug");
    expect(params.has("sort")).toBe(false);
    expect(params.has("direction")).toBe(false);
  });

  test("preserves the Inbox snoozed view marker", () => {
    const query = savedViewQuery(EMPTY_CLIENT_FILTER, { snoozed: true });
    expect(new URLSearchParams(query).get("snoozed")).toBe("1");
  });

  test("opening applies stored sort, direction and query", () => {
    const url = savedViewUrl({
      scope: "issues",
      query: "repo=org%2Fcore&blocked=true",
      sort: "updated",
      direction: "desc",
    });
    const parsed = new URL(url, "http://x");
    expect(parsed.pathname).toBe("/issues");
    expect(parsed.searchParams.get("repo")).toBe("org/core");
    expect(parsed.searchParams.get("blocked")).toBe("true");
    expect(parsed.searchParams.get("sort")).toBe("updated");
    expect(parsed.searchParams.get("direction")).toBe("desc");
    expect(parseFilterParams(parsed.searchParams).sort).toBe("updated");
    expect(parseFilterParams(parsed.searchParams).direction).toBe("desc");
  });

  test("storing the default sort clears a stale query value", () => {
    const url = savedViewUrl({
      scope: "inbox",
      query: "q=crash&sort=updated&direction=desc",
      sort: "priority",
      direction: "asc",
    });
    const parsed = new URL(url, "http://x");
    expect(parsed.pathname).toBe("/inbox");
    expect(parsed.searchParams.get("q")).toBe("crash");
    expect(parsed.searchParams.has("sort")).toBe(false);
    expect(parsed.searchParams.has("direction")).toBe(false);
  });
});

describe("saved-view storage", () => {
  test("creates, lists, updates, pins and deletes a view", () => {
    const created = create(ALICE, "My queue", { pinned: true });
    expect(getSavedView(created.id)?.name).toBe("My queue");
    expect(created.shared).toBe(false);
    expect(created.group).toBe("status");

    const renamed = updateSavedView(ALICE, created.id, {
      name: "Core queue",
      shared: true,
    });
    expect(renamed.ok).toBe(true);
    if (renamed.ok) {
      expect(renamed.value.name).toBe("Core queue");
      expect(renamed.value.shared).toBe(true);
      expect(renamed.value.pinned).toBe(true);
    }

    const unpinned = updateSavedView(ALICE, created.id, { pinned: false });
    expect(unpinned.ok && unpinned.value.pinned).toBe(false);

    const deleted = deleteSavedView(ALICE, created.id);
    expect(deleted.ok).toBe(true);
    expect(getSavedView(created.id)).toBeUndefined();
  });

  test("promotes sort and direction out of a submitted query", () => {
    const result = validateSavedViewInput({
      name: "  Sprint  ",
      query: "?q=api&sort=title&direction=desc&evil=1",
      scope: "issues",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("evil");

    const valid = validateSavedViewInput({
      name: "  Sprint  ",
      query: "?q=api&sort=title&direction=desc",
      scope: "issues",
    });
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.value.name).toBe("Sprint");
    expect(valid.value.query).toBe("q=api");
    expect(valid.value.sort).toBe("title");
    expect(valid.value.direction).toBe("desc");
  });

  test("rejects invalid names, scopes, sorts, groups and unsafe queries", () => {
    expect(validateSavedViewInput({ name: " ", query: "", scope: "issues" }).ok).toBe(false);
    expect(
      validateSavedViewInput({ name: "x".repeat(121), query: "", scope: "issues" }).ok,
    ).toBe(false);
    expect(
      validateSavedViewInput({ name: "x", query: "", scope: "board" as never }).ok,
    ).toBe(false);
    expect(
      validateSavedViewInput({ name: "x", query: "sort=nope", scope: "issues" }).ok,
    ).toBe(false);
    expect(
      validateSavedViewInput({ name: "x", query: "", scope: "issues", group: "epic" }).ok,
    ).toBe(false);
    expect(
      validateSavedViewInput({
        name: "x",
        query: "type=Bug&type=none",
        scope: "issues",
        group: "type",
      }).ok,
    ).toBe(true);
    expect(
      validateSavedViewInput({
        name: "x",
        query: "https://evil.example/path",
        scope: "issues",
      }).ok,
    ).toBe(false);
    expect(
      validateSavedViewInput({ name: "x", query: "q=a#fragment", scope: "issues" }).ok,
    ).toBe(false);
    expect(
      validateSavedViewInput({ name: "x", query: "snoozed=yes", scope: "inbox" }).ok,
    ).toBe(false);
  });

  test("names are unique per owner, case-insensitively", () => {
    create(BOB, "Sprint");
    const duplicate = createSavedView(BOB, {
      name: "  sprint ",
      query: "",
      scope: "issues",
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.status).toBe(409);

    // Another owner may reuse the name.
    const other = createSavedView(ALICE, {
      name: "sprint",
      query: "",
      scope: "issues",
    });
    expect(other.ok).toBe(true);
  });

  test("lists pinned views first, then own views before shared ones", () => {
    const shared = create(BOB, "Shared", { shared: true, pinned: false });
    const own = create(ALICE, "Z own", { pinned: false });
    const pinned = create(ALICE, "A pinned", { pinned: true });
    create(BOB, "Bob private");

    const views = listSavedViews(ALICE.id);
    expect(views.map((view) => view.name)).toEqual([
      "A pinned",
      "Z own",
      "Shared",
    ]);
    expect(views.map((view) => view.id)).toContain(own.id);
    expect(views.map((view) => view.id)).toContain(pinned.id);
    expect(views.map((view) => view.id)).toContain(shared.id);
    expect(views.some((view) => view.name === "Bob private")).toBe(false);
  });

  test("owners manage their views; others only when shared and admin", () => {
    const personal = create(ALICE, "Private");
    const shared = create(ALICE, "Shared", { shared: true });

    expect(canManageSavedView(personal, ALICE)).toBe(true);
    expect(canManageSavedView(personal, BOB)).toBe(false);
    expect(canManageSavedView(shared, BOB)).toBe(false);
    expect(canManageSavedView(shared, ADMIN)).toBe(true);

    const forbidden = updateSavedView(BOB, shared.id, { name: "Hijacked" });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.status).toBe(403);

    const forbiddenDelete = deleteSavedView(BOB, personal.id);
    expect(forbiddenDelete.ok).toBe(false);

    const adminEdit = updateSavedView(ADMIN, shared.id, { pinned: true });
    expect(adminEdit.ok).toBe(true);
  });
});

describe("saved-view API", () => {
  test("requires a session to list and a write role to mutate", async () => {
    const anonymous = await listRoute({ locals: locals(null) } as never);
    expect(anonymous.status).toBe(401);

    const readerList = await listRoute({ locals: locals(READER) } as never);
    expect(readerList.status).toBe(200);

    const readerCreate = await createRoute({
      request: jsonRequest({ name: "x", query: "", scope: "issues" }),
      locals: locals(READER),
    } as never);
    expect(readerCreate.status).toBe(403);

    const readerPatch = await patchRoute({
      request: jsonRequest({ id: "x", name: "y" }),
      locals: locals(READER),
    } as never);
    expect(readerPatch.status).toBe(403);

    const readerDelete = await deleteRoute({
      url: new URL("http://x/api/saved-views?id=x"),
      locals: locals(READER),
    } as never);
    expect(readerDelete.status).toBe(403);
  });

  test("creates, lists, patches and deletes through the JSON API", async () => {
    const created = await createRoute({
      request: jsonRequest({
        name: "Triage",
        query: "status=todo",
        scope: "inbox",
        sort: "updated",
        direction: "desc",
        group: "priority",
        shared: true,
      }),
      locals: locals(ALICE),
    } as never);
    expect(created.status).toBe(201);
    const view = (await created.json()) as SavedView;
    expect(view.scope).toBe("inbox");
    expect(view.shared).toBe(true);

    const readerList = await listRoute({ locals: locals(READER) } as never);
    const listed = (await readerList.json()) as { views: SavedView[] };
    expect(listed.views.some((entry) => entry.id === view.id)).toBe(true);

    const patched = await patchRoute({
      request: new Request("http://x/api/saved-views", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: view.id, pinned: true }),
      }),
      locals: locals(ALICE),
    } as never);
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as SavedView).pinned).toBe(true);

    const deleted = await deleteRoute({
      url: new URL(`http://x/api/saved-views?id=${view.id}`),
      locals: locals(ALICE),
    } as never);
    expect(deleted.status).toBe(200);
    expect(getSavedView(view.id)).toBeUndefined();
  });

  test("rejects malformed create and missing ids", async () => {
    const malformed = await createRoute({
      request: new Request("http://x/api/saved-views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      locals: locals(ALICE),
    } as never);
    expect(malformed.status).toBe(400);

    const missingId = await deleteRoute({
      url: new URL("http://x/api/saved-views"),
      locals: locals(ALICE),
    } as never);
    expect(missingId.status).toBe(400);

    const unknown = await patchRoute({
      request: jsonRequest({ id: "nope", name: "x" }),
      locals: locals(ALICE),
    } as never);
    expect(unknown.status).toBe(404);
  });

  test("a non-owner write user cannot patch a shared view; an admin can", async () => {
    const view = create(ALICE, "Shared", { shared: true });

    const forbidden = await patchRoute({
      request: jsonRequest({ id: view.id, name: "Taken" }),
      locals: locals(BOB),
    } as never);
    expect(forbidden.status).toBe(403);

    const admin = await patchRoute({
      request: jsonRequest({ id: view.id, name: "Managed" }),
      locals: locals(ADMIN),
    } as never);
    expect(admin.status).toBe(200);
    expect(((await admin.json()) as SavedView).name).toBe("Managed");
  });
});

describe("saved-view UI contracts", () => {
  test("the switcher applies grouping and exposes save/manage actions", () => {
    const menu = source("src/lib/components/views/SavedViewsMenu.svelte");
    expect(menu).toContain("savedViewUrl");
    expect(menu).toContain("setGroupBy");
    expect(menu).toContain("Save current view…");
    expect(menu).toContain("Update with current filters");
    expect(menu).toContain("savedViewQuery");
    expect(menu).toContain("invalidateAll");
    expect(menu).toContain("saved-view-shared");
    expect(menu).toContain("{#if mayWrite}");
    expect(menu).toContain("deleteSavedViewRequest");
  });

  test("Issues and Inbox mount the switcher with their own scope", () => {
    const issues = source("src/routes/(app)/issues/+page.svelte");
    const inbox = source("src/routes/(app)/inbox/+page.svelte");
    expect(issues).toContain("<SavedViewsMenu");
    expect(issues).toContain('scope="issues"');
    expect(inbox).toContain("<SavedViewsMenu");
    expect(inbox).toContain('scope="inbox"');
  });

  test("the layout loads the visible views for every cockpit page", () => {
    const layout = source("src/routes/(app)/+layout.server.ts");
    expect(layout).toContain("listSavedViews");
    expect(layout).toContain("savedViews");
  });
});
