import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { stateIntakeSubmission } from "#lib/server/db/schema";
import { createSubmission } from "#lib/server/intake/staging";
import {
  encodeCursor,
} from "#lib/server/issues/pagination";
import type { RenderedInboxEntry } from "#lib/server/issues/types";
import { upsertIssue, upsertRepo, type UserRecord } from "#lib/server/sync/mirror";
import { GET as getBoard } from "#/routes/api/feeds/board/+server";
import { GET as getInbox } from "#/routes/api/feeds/inbox/+server";
import { GET as getIssues } from "#/routes/api/feeds/issues/+server";
import { boardPage } from "#/routes/api/feeds/board/+server";
import { inboxPage } from "#/routes/api/feeds/inbox/+server";
import { issuesPage } from "#/routes/api/feeds/issues/+server";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";

// The feeds require a signed-in `read` session (RBAC).
const READ = { user: { id: "reader", role: "read" }, session: null };

const DAY_MS = 86_400_000;

function user(githubId: number, login: string): UserRecord {
  return { githubId, login, avatarUrl: `https://avatars/${login}.png` };
}

function issue(input: {
  repoId: number;
  number: number;
  githubId: number;
  title: string;
  state?: "open" | "closed";
  stateReason?: string | null;
  updatedAt: number;
  closedAt?: number | null;
  labels?: string[];
  status: string | null;
  priority: string | null;
}): void {
  upsertIssue(
    {
      githubId: input.githubId,
      repoId: input.repoId,
      number: input.number,
      title: input.title,
      body: "",
      state: input.state ?? "open",
      stateReason: input.stateReason ?? null,
      author: user(7, "octocat"),
      milestoneNumber: null,
      createdAt: 1,
      updatedAt: input.updatedAt,
      closedAt: input.closedAt ?? null,
      labels: input.labels ?? [],
      assignees: [],
      comments: [],
    },
    {
      status: input.status,
      priority: input.priority,
      size: null,
      blocked: false,
      labelConflict: false,
    },
  );
}

function seed(): void {
  upsertRepo({ githubId: 1, org: "orgA", name: "core", archived: false });
  upsertRepo({ githubId: 2, org: "orgA", name: "web", archived: false });

  issue({
    repoId: 1,
    number: 1,
    githubId: 101,
    title: "Alpha crash",
    updatedAt: 100,
    status: "todo",
    priority: "p1",
  });
  issue({
    repoId: 1,
    number: 2,
    githubId: 102,
    title: "Beta untriaged",
    updatedAt: 200,
    status: null,
    priority: null,
  });
  issue({
    repoId: 2,
    number: 3,
    githubId: 103,
    title: "Gamma regression",
    updatedAt: 300,
    status: "in-progress",
    priority: "p2",
  });
  issue({
    repoId: 2,
    number: 4,
    githubId: 104,
    title: "Delta done",
    state: "closed",
    stateReason: "completed",
    updatedAt: 400,
    closedAt: Date.now() - DAY_MS,
    status: null,
    priority: null,
  });
}

function search(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

function url(path: string, query = ""): URL {
  return new URL(`http://x${path}${query}`);
}

beforeEach(() => {
  db.delete(stateIntakeSubmission).run();
  clearMirror();
  setConfig(TEST_CONFIG);
  seed();
});

describe("issuesPage", () => {
  test("returns a page shape defaulting to the open state", () => {
    const page = issuesPage(search(""), null);
    expect(page.items.map((item) => item.number)).toEqual([1, 3]);
    expect(page.total).toBe(2);
    expect(page.nextCursor).toBeNull();
  });

  test("walks pages with the returned cursor", () => {
    const first = issuesPage(search("limit=1"), null);
    expect(first.items.map((item) => item.number)).toEqual([1]);
    expect(first.total).toBe(2);
    expect(first.nextCursor).not.toBeNull();

    const second = issuesPage(search(`limit=1&cursor=${first.nextCursor}`), null);
    expect(second.items.map((item) => item.number)).toEqual([3]);
    expect(second.total).toBe(2);
    expect(second.nextCursor).toBeNull();
  });

  test("honours filter dimensions", () => {
    const page = issuesPage(search("priority=p2"), null);
    expect(page.items.map((item) => item.number)).toEqual([3]);
    expect(page.total).toBe(1);
  });

  test("throws on a malformed or foreign cursor", () => {
    expect(() => issuesPage(search("cursor=not-a-cursor"), null)).toThrow(
      "Invalid cursor",
    );

    const foreign = encodeCursor("a-different-filter", [0, 100, 1, 1]);
    expect(() => issuesPage(search(`priority=p2&cursor=${foreign}`), null)).toThrow(
      "Invalid cursor",
    );
  });
});

describe("GET /api/feeds/issues", () => {
  test("returns JSON for a signed-in reader", async () => {
    const res = await getIssues({
      url: url("/api/feeds/issues"),
      locals: READ,
    } as never);

    expect(res.status).toBe(200);
    const page = (await res.json()) as {
      items: Array<{ number: number }>;
      total: number;
    };
    expect(page.items.map((item) => item.number)).toEqual([1, 3]);
    expect(page.total).toBe(2);
  });

  test("maps a bad cursor to 400", async () => {
    const res = await getIssues({
      url: url("/api/feeds/issues", "?cursor=not-a-cursor"),
      locals: READ,
    } as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Invalid cursor" });
  });

  test("denies an anonymous request", async () => {
    const res = await getIssues({
      url: url("/api/feeds/issues"),
      locals: { user: null, session: null },
    } as never);

    expect(res.status).toBe(401);
  });
});

describe("inboxPage", () => {
  test("renders submission HTML and pages the issue half", () => {
    const { id } = createSubmission({
      title: "Inbound request",
      body: "# Hi\n\n<img src=x onerror=alert(1)>",
    });

    const page = inboxPage(search(""), null);
    expect(page.items[0]).toMatchObject({
      kind: "submission",
      submission: { id, title: "Inbound request" },
    });
    const submission = page.items[0] as Extract<
      RenderedInboxEntry,
      { kind: "submission" }
    >;
    expect(submission.submission.bodyHtml).toContain("<h1>Hi</h1>");
    expect(submission.submission.bodyHtml).not.toContain("onerror");

    expect(page.items.map((entry) => entry.kind)).toEqual([
      "submission",
      "issue",
    ]);
    expect(page.total).toBe(2);
    expect(page.nextCursor).toBeNull();
  });

  test("GET returns the rendered page", async () => {
    createSubmission({ title: "Inbound request", body: "please" });
    const res = await getInbox({
      url: url("/api/feeds/inbox"),
      locals: READ,
    } as never);

    expect(res.status).toBe(200);
    const page = (await res.json()) as {
      items: Array<{ kind: string; submission?: { bodyHtml: string } }>;
      total: number;
    };
    expect(page.total).toBe(2);
    expect(page.items[0].kind).toBe("submission");
    expect(page.items[0].submission?.bodyHtml).toContain("please");
  });
});

describe("boardPage", () => {
  test("returns one lane page with its server total", async () => {
    const page = await boardPage(search("column=in-progress"), null);
    expect(page.items.map((item) => item.number)).toEqual([3]);
    expect(page.total).toBe(1);
    expect(page.nextCursor).toBeNull();

    const done = await boardPage(search("column=done"), null);
    expect(done.items.map((item) => item.number)).toEqual([4]);
    expect(done.total).toBe(1);
  });

  test("rejects an unknown column", async () => {
    await expect(boardPage(search("column=nope"), null)).rejects.toThrow(
      "Unknown column",
    );

    const res = await getBoard({
      url: url("/api/feeds/board", "?column=nope"),
      locals: READ,
    } as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Unknown column" });
  });

  test("rejects a cursor from another lane", async () => {
    issue({
      repoId: 1,
      number: 5,
      githubId: 105,
      title: "Epsilon polish",
      updatedAt: 50,
      status: "in-progress",
      priority: null,
    });

    const first = await boardPage(search("column=in-progress&limit=1"), null);
    expect(first.nextCursor).not.toBeNull();

    await expect(
      boardPage(search(`column=done&cursor=${first.nextCursor}`), null),
    ).rejects.toThrow("Invalid cursor");
  });
});
