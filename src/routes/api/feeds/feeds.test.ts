import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { stateIntakeSubmission } from "#lib/server/db/schema";
import { createSubmission } from "#lib/server/intake/staging";
import { encodeCursor } from "#lib/server/issues/pagination";
import { upsertIssue, upsertRepo, type UserRecord } from "#lib/server/sync/mirror";
import { GET as getBoard } from "#/routes/api/feeds/board/+server";
import { GET as getInbox } from "#/routes/api/feeds/inbox/+server";
import { GET as getIssues } from "#/routes/api/feeds/issues/+server";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";

// The feeds require a signed-in `read` session (RBAC).
const READ = { user: { id: "reader", role: "read" }, session: null };
const ANON = { user: null, session: null };

const DAY_MS = 86_400_000;

interface Page {
  items: Array<Record<string, unknown>>;
  total: number;
  nextCursor: string | null;
}

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

function url(path: string, query = ""): URL {
  return new URL(`http://x${path}${query}`);
}

async function pageOf(res: Response): Promise<Page> {
  return (await res.json()) as Page;
}

beforeEach(() => {
  db.delete(stateIntakeSubmission).run();
  clearMirror();
  setConfig(TEST_CONFIG);
  seed();
});

describe("GET /api/feeds/issues", () => {
  test("returns a page shape defaulting to the open state", async () => {
    const res = await getIssues({
      url: url("/api/feeds/issues"),
      locals: READ,
    } as never);

    expect(res.status).toBe(200);
    const page = await pageOf(res);
    expect(page.items.map((item) => item.number)).toEqual([1, 3]);
    expect(page.total).toBe(2);
    expect(page.nextCursor).toBeNull();
  });

  test("walks pages with the returned cursor", async () => {
    const first = await pageOf(
      await getIssues({
        url: url("/api/feeds/issues", "?limit=1"),
        locals: READ,
      } as never),
    );
    expect(first.items.map((item) => item.number)).toEqual([1]);
    expect(first.total).toBe(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await pageOf(
      await getIssues({
        url: url(
          "/api/feeds/issues",
          `?limit=1&cursor=${first.nextCursor}`,
        ),
        locals: READ,
      } as never),
    );
    expect(second.items.map((item) => item.number)).toEqual([3]);
    expect(second.total).toBe(2);
    expect(second.nextCursor).toBeNull();
  });

  test("honours filter dimensions", async () => {
    const page = await pageOf(
      await getIssues({
        url: url("/api/feeds/issues", "?priority=p2"),
        locals: READ,
      } as never),
    );
    expect(page.items.map((item) => item.number)).toEqual([3]);
    expect(page.total).toBe(1);
  });

  test("maps a malformed or foreign cursor to 400", async () => {
    const malformed = await getIssues({
      url: url("/api/feeds/issues", "?cursor=not-a-cursor"),
      locals: READ,
    } as never);
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ message: "Invalid cursor" });

    const foreign = encodeCursor("a-different-filter", [0, 100, 1, 1]);
    const mismatched = await getIssues({
      url: url("/api/feeds/issues", `?priority=p2&cursor=${foreign}`),
      locals: READ,
    } as never);
    expect(mismatched.status).toBe(400);
    expect(await mismatched.json()).toEqual({ message: "Invalid cursor" });
  });

  test("denies an anonymous request", async () => {
    const res = await getIssues({
      url: url("/api/feeds/issues"),
      locals: ANON,
    } as never);

    expect(res.status).toBe(401);
  });
});

describe("GET /api/feeds/inbox", () => {
  test("renders submission HTML and pages the issue half", async () => {
    const { id } = createSubmission({
      title: "Inbound request",
      body: "# Hi\n\n<img src=x onerror=alert(1)>",
    });

    const res = await getInbox({
      url: url("/api/feeds/inbox"),
      locals: READ,
    } as never);
    expect(res.status).toBe(200);

    const page = await pageOf(res);
    expect(page.items[0]).toMatchObject({
      kind: "submission",
      submission: { id, title: "Inbound request" },
    });
    const submission = page.items[0] as {
      submission: { bodyHtml: string };
    };
    expect(submission.submission.bodyHtml).toContain("<h1>Hi</h1>");
    expect(submission.submission.bodyHtml).not.toContain("onerror");

    expect(page.items.map((entry) => entry.kind)).toEqual([
      "submission",
      "issue",
    ]);
    expect(page.total).toBe(2);
    expect(page.nextCursor).toBeNull();
  });

  test("rejects a cursor minted for the All Issues feed", async () => {
    // `state=open` makes both feeds parse the same filter, so only the feed
    // identity in the signature distinguishes them.
    const issues = await pageOf(
      await getIssues({
        url: url("/api/feeds/issues", "?state=open&limit=1"),
        locals: READ,
      } as never),
    );
    expect(issues.nextCursor).not.toBeNull();

    const res = await getInbox({
      url: url(
        "/api/feeds/inbox",
        `?state=open&cursor=${issues.nextCursor}`,
      ),
      locals: READ,
    } as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Invalid cursor" });
  });

  test("denies an anonymous request", async () => {
    const res = await getInbox({
      url: url("/api/feeds/inbox"),
      locals: ANON,
    } as never);

    expect(res.status).toBe(401);
  });
});

describe("GET /api/feeds/board", () => {
  test("returns one lane page with its server total", async () => {
    const page = await pageOf(
      await getBoard({
        url: url("/api/feeds/board", "?column=in-progress"),
        locals: READ,
      } as never),
    );
    expect(page.items.map((item) => item.number)).toEqual([3]);
    expect(page.total).toBe(1);
    expect(page.nextCursor).toBeNull();

    const done = await pageOf(
      await getBoard({
        url: url("/api/feeds/board", "?column=done"),
        locals: READ,
      } as never),
    );
    expect(done.items.map((item) => item.number)).toEqual([4]);
    expect(done.total).toBe(1);
  });

  test("rejects an unknown column", async () => {
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

    const first = await pageOf(
      await getBoard({
        url: url("/api/feeds/board", "?column=in-progress&limit=1"),
        locals: READ,
      } as never),
    );
    expect(first.nextCursor).not.toBeNull();

    const res = await getBoard({
      url: url("/api/feeds/board", `?column=done&cursor=${first.nextCursor}`),
      locals: READ,
    } as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Invalid cursor" });
  });

  test("denies an anonymous request", async () => {
    const res = await getBoard({
      url: url("/api/feeds/board", "?column=in-progress"),
      locals: ANON,
    } as never);

    expect(res.status).toBe(401);
  });
});
