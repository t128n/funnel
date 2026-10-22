import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { symmetricEncrypt } from "better-auth/crypto";
import { FUNNEL_SECRET, FUNNEL_UPLOAD_DIR } from "$app/env/private";
import { setConfig } from "#/lib/server/config";
import { db } from "#/lib/server/db/index";
import {
  authAccount,
  authUser,
  stateAttachment,
  stateWorkNote,
} from "#/lib/server/db/schema";
import { forge } from "#/lib/server/forge/providers.server";
import { upsertRepo } from "#/lib/server/sync/mirror";
import { GET as downloadAttachment, DELETE as removeAttachment } from "#/routes/api/attachments/[id]/+server";
import { POST as uploadAttachment } from "#/routes/api/repos/[owner]/[repo]/issues/[number]/attachments/+server";
import { POST as createNote } from "#/routes/api/repos/[owner]/[repo]/issues/[number]/work-notes/+server";
import {
  DELETE as deleteNote,
  PATCH as patchNote,
} from "#/routes/api/repos/[owner]/[repo]/issues/[number]/work-notes/[id]/+server";
import { POST as publishNote } from "#/routes/api/repos/[owner]/[repo]/issues/[number]/work-notes/[id]/publish/+server";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";

// Funnel-local writes: work notes and attachments need only a session, so the
// GitHub client is only exercised by the (explicit) publish path. A repo unique
// to this file keeps the process-wide installation-id cache isolated.
const OWNER = "notesqa";
const REPO = "sandbox";
const REPO_SLUG = `${OWNER}/${REPO}`;

const realFetch = globalThis.fetch;
const calls: string[] = [];

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function stubFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  calls.push(
    `${(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()} ${url.pathname}`,
  );
  if (url.pathname.endsWith("/installation")) return json({ id: 7 });
  if (url.pathname.includes("/app/installations/")) {
    return json({
      token: "installation-token",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
  }
  if (/\/repos\/[^/]+\/[^/]+\/issues\/1\/comments$/.test(url.pathname)) {
    return json({ id: 9, html_url: `https://github.com/${REPO_SLUG}/issues/1#issuecomment-9` }, 201);
  }
  return json({});
}

async function seedViewer(): Promise<void> {
  const now = new Date();
  await db
    .insert(authUser)
    .values({
      id: "notes_user_1",
      name: "Me",
      email: "notes-user@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(authAccount)
    .values({
      id: "notes_acc_1",
      accountId: "4242",
      providerId: "github",
      userId: "notes_user_1",
      accessToken: await symmetricEncrypt({ key: FUNNEL_SECRET, data: "ghu_token" }),
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

const viewer = () => ({
  user: { id: "notes_user_1", name: "Me", email: "n@example.com", image: null, role: "write" },
  session: null,
});
const params = (id?: string) => ({ owner: OWNER, repo: REPO, number: "1", ...(id ? { id } : {}) });

function jsonRequest(body: unknown): Request {
  return new Request(`http://x/api/repos/${REPO_SLUG}/issues/1/work-notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function uploadRequest(filename = "hello.txt"): Request {
  const form = new FormData();
  form.append("file", new File([new TextEncoder().encode("hi there")], filename, { type: "text/plain" }));
  return new Request(`http://x/api/repos/${REPO_SLUG}/issues/1/attachments`, {
    method: "POST",
    body: form,
  });
}

beforeEach(async () => {
  calls.length = 0;
  clearMirror();
  db.delete(stateWorkNote).run();
  db.delete(stateAttachment).run();
  await rm(resolve(FUNNEL_UPLOAD_DIR), { recursive: true, force: true });
  setConfig({ ...TEST_CONFIG, repos: [{ repo: REPO_SLUG, shortcode: "CORE" }] });
  forge.resetCaches();
  globalThis.fetch = stubFetch as typeof fetch;
  upsertRepo({ githubId: 1, org: OWNER, name: REPO, archived: false });
  await seedViewer();
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  globalThis.fetch = realFetch;
  await rm(resolve(FUNNEL_UPLOAD_DIR), { recursive: true, force: true });
});

describe("POST /api/repos/{owner}/{repo}/issues/{number}/work-notes", () => {
  test("creates an internal note and derives the author from the session", async () => {
    const res = await createNote({
      params: params(),
      request: jsonRequest({ body: "  investigating  " }),
      locals: viewer(),
    } as never);

    expect(res.status).toBe(201);
    const note = (await res.json()) as { body: string; author: { login: string } | null };
    expect(note.body).toBe("investigating");
    expect(note.author?.login).toBe("Me");
    expect(calls).toHaveLength(0);
  });

  test("requires a session", async () => {
    const res = await createNote({
      params: params(),
      request: jsonRequest({ body: "hello" }),
      locals: { user: null, session: null },
    } as never);
    expect(res.status).toBe(401);
  });

  test("rejects an empty body", async () => {
    const res = await createNote({
      params: params(),
      request: jsonRequest({ body: "   " }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(400);
  });

  test("404s for an unmirrored repository", async () => {
    clearMirror();
    const res = await createNote({
      params: params(),
      request: jsonRequest({ body: "hello" }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(404);
  });
});

describe("work-note edit, delete, and publish", () => {
  async function create(): Promise<string> {
    const res = await createNote({
      params: params(),
      request: jsonRequest({ body: "original" }),
      locals: viewer(),
    } as never);
    return ((await res.json()) as { id: string }).id;
  }

  test("edits a note", async () => {
    const id = await create();
    const res = await patchNote({
      params: params(id),
      request: jsonRequest({ body: "edited" }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(200);
    expect((await res.json()) as { body: string }).toMatchObject({ body: "edited" });
  });

  test("404s editing a missing note", async () => {
    const res = await patchNote({
      params: params("missing"),
      request: jsonRequest({ body: "edited" }),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(404);
  });

  test("deletes a note", async () => {
    const id = await create();
    const first = await deleteNote({ params: params(id), locals: viewer() } as never);
    expect(first.status).toBe(204);
    const second = await deleteNote({ params: params(id), locals: viewer() } as never);
    expect(second.status).toBe(404);
  });

  test("publishes a note to GitHub as a comment and removes it", async () => {
    const id = await create();
    const res = await publishNote({ params: params(id), locals: viewer() } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id });
    expect(calls).toContain(`POST /repos/${REPO_SLUG}/issues/1/comments`);

    // The note is gone from the internal journal.
    expect(db.select().from(stateWorkNote).all()).toHaveLength(0);

    // …so publishing it again is a 404.
    const again = await publishNote({ params: params(id), locals: viewer() } as never);
    expect(again.status).toBe(404);
  });

  test("refuses to publish without a linked account", async () => {
    const id = await create();
    const res = await publishNote({
      params: params(id),
      locals: { user: { id: "ghost", role: "write" }, session: null },
    } as never);
    expect(res.status).toBe(502);
  });
});

describe("attachment upload, download, and delete", () => {
  test("uploads, downloads the bytes, then deletes", async () => {
    const res = await uploadAttachment({
      params: params(),
      request: uploadRequest(),
      locals: viewer(),
    } as never);
    expect(res.status).toBe(201);
    const item = (await res.json()) as { id: string; filename: string; sizeBytes: number };
    expect(item.filename).toBe("hello.txt");
    expect(item.sizeBytes).toBe(8);

    const download = await downloadAttachment({
      params: { id: item.id },
      locals: viewer(),
    } as never);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("hello.txt");
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await download.arrayBuffer()).toString()).toBe("hi there");

    const removed = await removeAttachment({
      params: { id: item.id },
      locals: viewer(),
    } as never);
    expect(removed.status).toBe(204);
    const missing = await downloadAttachment({
      params: { id: item.id },
      locals: viewer(),
    } as never);
    expect(missing.status).toBe(404);
  });

  test("requires a session to upload", async () => {
    const res = await uploadAttachment({
      params: params(),
      request: uploadRequest(),
      locals: { user: null, session: null },
    } as never);
    expect(res.status).toBe(401);
  });

  test("rejects a request without a file", async () => {
    const request = new Request(`http://x/api/repos/${REPO_SLUG}/issues/1/attachments`, {
      method: "POST",
      body: new FormData(),
    });
    const res = await uploadAttachment({
      params: params(),
      request,
      locals: viewer(),
    } as never);
    expect(res.status).toBe(400);
  });
});
