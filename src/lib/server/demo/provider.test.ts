import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import {
  mirrorComment,
  mirrorMilestone,
  mirrorThread,
  mirrorUser,
} from "#lib/server/db/schema";
import type { RepoRef, ThreadRef } from "#lib/server/forge/providers.server";
import { deriveMetadata } from "#lib/server/sync/conflicts";
import {
  getIssueComments,
  getIssueLabels,
  replaceRepoLabels,
  upsertIssue,
  upsertRepo,
  type RepoRow,
  type UserRecord,
} from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";
import {
  DEMO_FORGE,
  DEMO_INSTANCE,
  DEMO_USER_LOGIN,
} from "./profile";
import { demoProvider } from "./provider";

const GITHUB = { forge: DEMO_FORGE, instance: DEMO_INSTANCE } as const;

function person(externalId: string, login: string): UserRecord {
  return {
    id: 0,
    externalId,
    ...GITHUB,
    login,
    avatarUrl: `https://avatars.githubusercontent.com/u/${externalId}?v=4`,
    url: `https://github.com/${login}`,
  };
}

const mira = person("1002", "mira");

let funnel: RepoRow;
let platform: RepoRow;

/** One fixture issue: `demo/funnel#1`, open, backlog/frontend. */
function seed(): void {
  funnel = upsertRepo({
    externalId: "1",
    ...GITHUB,
    org: "demo",
    name: "funnel",
    url: "https://github.com/demo/funnel",
    archived: false,
  });
  platform = upsertRepo({
    externalId: "2",
    ...GITHUB,
    org: "demo",
    name: "platform",
    url: "https://github.com/demo/platform",
    archived: false,
  });
  replaceRepoLabels(funnel.id, [
    { name: "backlog", color: "ededed", description: "Status: Backlog" },
    { name: "frontend", color: "1d76db", description: "Browser and UI work" },
  ]);
  replaceRepoLabels(platform.id, [
    { name: "backend", color: "0e8a16", description: "Server and data work" },
  ]);
  const metadata = deriveMetadata(["backlog", "frontend"]);
  upsertIssue(
    {
      externalId: "101",
      repoId: funnel.id,
      number: 1,
      kind: "issue",
      title: "Alpha crash",
      body: "The first reproduction.",
      state: "open",
      stateReason: null,
      author: mira,
      milestoneNumber: null,
      url: "https://github.com/demo/funnel/issues/1",
      createdAt: 100,
      updatedAt: 200,
      closedAt: null,
      labels: ["backlog", "frontend"],
      assignees: [],
      comments: [],
    },
    {
      status: metadata.status,
      impact: metadata.impact,
      urgency: metadata.urgency,
      priority: metadata.priority,
      size: metadata.size,
      blocked: metadata.blocked,
      isEpic: metadata.isEpic,
      labelConflict: metadata.conflicts.length > 0,
    },
  );
}

function ref(repo: RepoRow, number: number): ThreadRef {
  return {
    ...GITHUB,
    repo: repoRef(repo),
    kind: "issue",
    number: String(number),
  };
}

function repoRef(repo: RepoRow): RepoRef {
  return {
    ...GITHUB,
    owner: repo.org,
    name: repo.name,
    externalId: repo.externalId,
  };
}

function stored(number = 1): typeof mirrorThread.$inferSelect {
  const row = db
    .select()
    .from(mirrorThread)
    .where(
      and(eq(mirrorThread.repoId, funnel.id), eq(mirrorThread.number, number)),
    )
    .get();
  if (!row) throw new Error(`missing fixture issue ${number}`);
  return row;
}

beforeEach(() => {
  clearMirror();
  seed();
});

afterEach(() => {
  clearMirror();
});

describe("demoProvider", () => {
  test("test_get", async () => {
    const provider = demoProvider();
    const thread = await provider.threads.get(ref(funnel, 1));

    expect(thread.title).toBe("Alpha crash");
    expect(thread.body).toBe("The first reproduction.");
    expect(thread.labels.map((label) => label.name).sort()).toEqual([
      "backlog",
      "frontend",
    ]);
    expect(thread.state).toBe("open");
    expect(thread.url).toBe("https://github.com/demo/funnel/issues/1");

    const missing = await provider.threads
      .get(ref(funnel, 99))
      .catch((error: unknown) => error);
    expect((missing as { status?: number }).status).toBe(404);

    const unknownRepo = await provider.threads
      .get(
        {
          ...ref(funnel, 1),
          repo: { ...repoRef(funnel), name: "absent" },
        },
      )
      .catch((error: unknown) => error);
    expect((unknownRepo as { status?: number }).status).toBe(404);

    // The REST passthrough answers from the same mirror, offline.
    const issues = await provider.request<Array<{ number: number }>>(
      "GET",
      "/repos/demo/funnel/issues",
      { query: { state: "all" } },
    );
    expect(issues.data.map((issue) => issue.number)).toEqual([1]);

    const comments = await provider.request(
      "GET",
      "/repos/demo/funnel/issues/1/comments",
    );
    expect(comments.data).toEqual([]);

    const labels = await provider.request<Array<{ name: string }>>(
      "GET",
      "/repos/demo/funnel/labels",
    );
    expect(labels.data.some((label) => label.name === "frontend")).toBe(true);

    const installation = await provider.request<{ id: number }>(
      "GET",
      "/repos/demo/funnel/installation",
    );
    expect(installation.data.id).toBe(1);

    const unknown = await provider
      .request("GET", "/repos/demo/funnel/unknown")
      .catch((error: unknown) => error);
    expect((unknown as { status?: number }).status).toBe(404);
  });

  test("test_labels", async () => {
    const provider = demoProvider();

    await provider.threads.setLabels(ref(funnel, 1), [
      "in-progress",
      "sev",
      "high",
    ]);
    // Labels are persisted as written; the return value is the new set.
    expect(getIssueLabels(funnel.id, 1).sort()).toEqual([
      "high",
      "in-progress",
      "sev",
    ]);
    expect(stored().status).toBe("in-progress");
    expect(stored().impact).toBe(1);
    expect(stored().urgency).toBe(1);
    expect(stored().priority).toBe("P1");

    await provider.threads.removeLabels(ref(funnel, 1), ["high"]);
    expect(getIssueLabels(funnel.id, 1).sort()).toEqual(["in-progress", "sev"]);
    expect(stored().urgency).toBeNull();
    // A lone impact axis still derives the P3 fallback, exactly like sync.
    expect(stored().priority).toBe("P3");

    await provider.threads.removeLabels(ref(funnel, 1), ["sev"]);
    expect(stored().impact).toBeNull();
    expect(stored().priority).toBeNull();

    await provider.threads.addLabels(ref(funnel, 1), ["docs"]);
    expect(getIssueLabels(funnel.id, 1)).toContain("docs");
  });

  test("test_comment", async () => {
    const provider = demoProvider();
    const comment = await provider.threads.createComment(
      ref(funnel, 1),
      "Started on this",
    );

    expect(comment.body).toBe("Started on this");
    expect(Number(comment.ref.id)).toBeGreaterThan(0);
    expect(comment.author?.login).toBe(DEMO_USER_LOGIN);

    const rows = db
      .select()
      .from(mirrorComment)
      .where(
        and(
          eq(mirrorComment.repoId, funnel.id),
          eq(mirrorComment.threadNumber, 1),
        ),
      )
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toBe("Started on this");
    const author = db
      .select()
      .from(mirrorUser)
      .where(eq(mirrorUser.id, rows[0]!.authorId!))
      .get();
    expect(author?.login).toBe(DEMO_USER_LOGIN);
    expect(getIssueComments(funnel.id, 1).map((c) => c.authorLogin)).toEqual([
      DEMO_USER_LOGIN,
    ]);
  });

  test("test_update_close", async () => {
    const provider = demoProvider();
    const before = stored().updatedAt;

    const updated = await provider.threads.update(ref(funnel, 1), {
      title: "Alpha crash, renamed",
      body: "A better reproduction.",
    });
    expect(updated.title).toBe("Alpha crash, renamed");
    expect(updated.body).toBe("A better reproduction.");
    expect(stored().updatedAt).toBeGreaterThan(before);

    const closedAtFloor = Date.now();
    const closed = await provider.threads.close(ref(funnel, 1), {
      reason: "completed",
    });
    expect(closed.state).toBe("closed");
    expect(closed.stateReason).toBe("completed");
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(closed.closedAt!.getTime()).toBeGreaterThanOrEqual(closedAtFloor);
    expect(stored().state).toBe("closed");
    expect(stored().stateReason).toBe("completed");

    const reopened = await provider.threads.update(ref(funnel, 1), {
      state: "open",
    });
    expect(reopened.state).toBe("open");
    expect(reopened.closedAt).toBeUndefined();
    expect(stored().closedAt).toBeNull();
    expect(stored().state).toBe("open");
  });

  test("test_create", async () => {
    const provider = demoProvider();
    const created = await provider.threads.create(repoRef(funnel), {
      kind: "issue",
      title: "A brand new issue",
      body: "Created locally.",
      labels: ["todo", "backend"],
      assignees: ["demo"],
    });

    expect(created.ref.number).toBe("2");
    expect(created.labels.map((label) => label.name).sort()).toEqual([
      "backend",
      "todo",
    ]);
    expect(created.author?.login).toBe(DEMO_USER_LOGIN);

    const read = await provider.threads.get(ref(funnel, 2));
    expect(read.title).toBe("A brand new issue");
    expect(read.body).toBe("Created locally.");
    expect(read.labels.map((label) => label.name).sort()).toEqual([
      "backend",
      "todo",
    ]);
    expect(read.assignees.map((assignee) => assignee.login)).toEqual(["demo"]);
    expect(read.author?.login).toBe(DEMO_USER_LOGIN);

    // Numbers are per repo: another repo still starts at 1.
    const other = await provider.threads.create(repoRef(platform), {
      kind: "issue",
      title: "Platform issue",
    });
    expect(other.ref.number).toBe("1");
  });

  test("test_milestone", async () => {
    const provider = demoProvider();
    const first = await provider.request<{
      id: number;
      number: number;
      title: string;
      state: string;
      due_on: string | null;
      html_url: string;
      creator: { login: string };
    }>("POST", "/repos/demo/funnel/milestones", {
      body: {
        title: "Demo v1",
        description: "The first demo milestone",
        due_on: "2026-11-01",
      },
    });

    expect(first.data.id).toBeGreaterThan(0);
    expect(first.data.number).toBe(1);
    expect(first.data.title).toBe("Demo v1");
    expect(first.data.state).toBe("open");
    expect(first.data.due_on?.startsWith("2026-11-01")).toBe(true);
    expect(first.data.html_url).toBe(
      "https://github.com/demo/funnel/milestone/1",
    );
    expect(first.data.creator.login).toBe(DEMO_USER_LOGIN);

    const second = await provider.request<{ number: number }>(
      "POST",
      "/repos/demo/funnel/milestones",
      { body: { title: "Demo v2" } },
    );
    expect(second.data.number).toBe(2);

    const listed = await provider.request<Array<{ number: number; title: string }>>(
      "GET",
      "/repos/demo/funnel/milestones",
      { query: { state: "all", per_page: 100 } },
    );
    expect(listed.data.map((milestone) => milestone.title)).toEqual([
      "Demo v1",
      "Demo v2",
    ]);
    expect(
      db
        .select()
        .from(mirrorMilestone)
        .where(eq(mirrorMilestone.repoId, funnel.id))
        .all(),
    ).toHaveLength(2);
  });

  test("test_offline", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network disabled in demo provider test");
    }) as unknown as typeof fetch;
    try {
      const provider = demoProvider();

      expect((await provider.threads.get(ref(funnel, 1))).title).toBe(
        "Alpha crash",
      );
      await provider.threads.setLabels(ref(funnel, 1), ["todo", "backend"]);
      await provider.threads.addLabels(ref(funnel, 1), ["docs"]);
      await provider.threads.removeLabels(ref(funnel, 1), ["docs"]);
      await provider.threads.update(ref(funnel, 1), { title: "Offline edit" });
      await provider.threads.close(ref(funnel, 1), { reason: "not_planned" });
      await provider.threads.update(ref(funnel, 1), { state: "open" });
      expect(await provider.threads.setMilestone(ref(funnel, 1), "1")).not.toBe(
        undefined,
      );
      expect(
        await provider.threads.setMilestone(ref(funnel, 1), undefined),
      ).toBeUndefined();
      const comment = await provider.threads.createComment(
        ref(funnel, 1),
        "Offline comment",
      );
      expect(Number(comment.ref.id)).toBeGreaterThan(0);
      const created = await provider.threads.create(repoRef(funnel), {
        kind: "issue",
        title: "Offline issue",
      });
      expect(created.ref.number).toBe("2");
      const milestone = await provider.request<{ number: number }>(
        "POST",
        "/repos/demo/funnel/milestones",
        { body: { title: "Offline milestone" } },
      );
      expect(milestone.data.number).toBe(1);
      const listed = await provider.request<unknown[]>(
        "GET",
        "/repos/demo/funnel/issues",
        { query: { state: "all" } },
      );
      expect(listed.data).toHaveLength(2);
    } finally {
      globalThis.fetch = original;
    }
  });
});
