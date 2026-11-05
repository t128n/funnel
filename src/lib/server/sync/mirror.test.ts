import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { buildVocabulary } from "#lib/labels";
import { clearMirror } from "#tests/mirror-helpers";
import { db } from "#lib/server/db/index";
import {
  mirrorComment,
  mirrorThread,
  mirrorThreadAssignee,
} from "#lib/server/db/schema";
import { getIssueListItem } from "#lib/server/issues/queries";
import * as mirror from "./mirror";

const GITHUB = { forge: "github", instance: "github.com" } as const;

beforeEach(() => {
  clearMirror();
});

function seedRepo() {
  return mirror.upsertRepo({
    externalId: "1",
    ...GITHUB,
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  });
}

function user(externalId: string, login: string): mirror.UserRecord {
  return {
    id: 0,
    externalId,
    ...GITHUB,
    login,
    avatarUrl: `a-${login}`,
    url: `https://github.com/${login}`,
  };
}

function seedIssue(repoId: number, number: number, updatedAt: number) {
  mirror.upsertIssue(
    {
      externalId: String(1000 + number),
      repoId,
      number,
      kind: "issue",
      title: `issue ${number}`,
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: `https://github.com/orgA/core/issues/${number}`,
      createdAt: updatedAt,
      updatedAt,
      closedAt: null,
      labels: ["todo"],
      assignees: [],
      comments: [],
    },
    { status: "todo", impact: null, urgency: null, priority: null, size: null, blocked: false, labelConflict: false },
  );
}

describe("forge-neutral mirror", () => {
  test("upsertRepo returns an internal id and is idempotent", () => {
    const a = mirror.upsertRepo({
      externalId: "7",
      ...GITHUB,
      org: "acme",
      name: "widgets",
      url: "https://github.com/acme/widgets",
      archived: false,
    });
    const b = mirror.upsertRepo({
      externalId: "7",
      ...GITHUB,
      org: "acme",
      name: "widgets",
      url: "https://github.com/acme/widgets",
      archived: true,
    });
    expect(b.id).toBe(a.id);
    expect(b.archived).toBe(1);
    expect(mirror.getRepoBySlug("github", "github.com", "acme", "widgets")?.id).toBe(
      a.id,
    );
    expect(mirror.getRepo(a.id)?.externalId).toBe("7");
    expect(mirror.getRepoByOrgName("acme", "widgets")?.id).toBe(a.id);
  });

  test("upsertUser is keyed by external id", () => {
    const a = mirror.upsertUser({
      id: 0,
      externalId: "101",
      ...GITHUB,
      login: "octocat",
      avatarUrl: "",
      url: "",
    });
    const b = mirror.upsertUser({
      id: 0,
      externalId: "101",
      ...GITHUB,
      login: "octocat2",
      avatarUrl: "x",
      url: "",
    });
    expect(b.id).toBe(a.id);
    expect(mirror.getUser("101", "github", "github.com")?.login).toBe("octocat2");
  });
});

describe("repo upsert", () => {
  test("creates then updates in place", () => {
    const created = seedRepo();
    expect(created).toMatchObject({
      externalId: "1",
      forge: "github",
      instance: "github.com",
      org: "orgA",
      name: "core",
      url: "https://github.com/orgA/core",
    });

    const updated = mirror.upsertRepo({
      externalId: "1",
      ...GITHUB,
      org: "orgA",
      name: "renamed",
      url: "https://github.com/orgA/renamed",
      archived: true,
    });
    expect(updated.name).toBe("renamed");
    expect(updated.url).toBe("https://github.com/orgA/renamed");
    expect(updated.archived).toBe(1);
    expect(mirror.listRepos()).toHaveLength(1);
  });
});

describe("cursor", () => {
  test("is null before backfill and the newest updated_at after", () => {
    const repo = seedRepo();
    expect(mirror.getRepoCursor(repo.id)).toBeNull();
    seedIssue(repo.id, 1, 1000);
    seedIssue(repo.id, 2, 3000);
    seedIssue(repo.id, 3, 2000);
    expect(mirror.getRepoCursor(repo.id)).toBe(3000);
  });
});

describe("issue upsert", () => {
  test("test_mirror_round_trip", () => {
    const repo = seedRepo();
    const record = {
      externalId: "7001",
      repoId: repo.id,
      number: 1,
      kind: "issue" as const,
      title: "epic",
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: "https://github.com/orgA/core/issues/1",
      createdAt: 1000,
      updatedAt: 1000,
      closedAt: null,
      labels: ["epic", "todo"],
      assignees: [],
      comments: [],
    };
    mirror.upsertIssue(record, {
      status: "todo",
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      isEpic: true,
      labelConflict: false,
    });

    expect(mirror.getIssue(repo.id, 1)?.isEpic).toBe(1);
    expect(getIssueListItem(repo.id, 1)?.isEpic).toBe(true);

    mirror.setIssueMetadata(repo.id, 1, {
      status: "todo",
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      isEpic: false,
      labelConflict: false,
    });
    expect(mirror.getIssue(repo.id, 1)?.isEpic).toBe(0);
  });

  test("test_metadata_write_keeps_epic_from_labels", () => {
    const repo = seedRepo();
    const record = {
      externalId: "7101",
      repoId: repo.id,
      number: 2,
      kind: "issue" as const,
      title: "epic",
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: "https://github.com/orgA/core/issues/2",
      createdAt: 1000,
      updatedAt: 1000,
      closedAt: null,
      labels: ["epic", "todo"],
      assignees: [],
      comments: [],
    };
    // Hydrate passes no isEpic; the label set is authoritative.
    mirror.upsertIssue(record, {
      status: "todo",
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      labelConflict: false,
    });
    expect(mirror.getIssue(repo.id, 2)?.isEpic).toBe(1);

    // Conflict resolution rewrites metadata without isEpic; the cache must not
    // be cleared for an issue whose labels still carry `epic`.
    mirror.setIssueMetadata(repo.id, 2, {
      status: "todo",
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      labelConflict: true,
    });
    expect(mirror.getIssue(repo.id, 2)?.isEpic).toBe(1);

    mirror.setIssueMetadata(repo.id, 2, {
      status: "todo",
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      isEpic: false,
      labelConflict: false,
    });
    expect(mirror.getIssue(repo.id, 2)?.isEpic).toBe(0);
  });

  test("resolves the epic label from the configured prefix", () => {
    const repo = seedRepo();
    const vocabulary = buildVocabulary("funnel");
    const record = {
      externalId: "7201",
      repoId: repo.id,
      number: 3,
      kind: "issue" as const,
      title: "prefixed epic",
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: "https://github.com/orgA/core/issues/3",
      createdAt: 1000,
      updatedAt: 1000,
      closedAt: null,
      labels: ["funnel-epic", "funnel-todo"],
      assignees: [],
      comments: [],
    };

    // Older callers may omit isEpic; the fallback must use `funnel-epic`.
    mirror.upsertIssue(
      record,
      {
        status: "todo",
        impact: null,
        urgency: null,
        priority: null,
        size: null,
        blocked: false,
        labelConflict: false,
      },
      vocabulary,
    );
    expect(mirror.getIssue(repo.id, 3)?.isEpic).toBe(1);

    // The metadata-only path shares the same vocabulary-aware fallback.
    mirror.setIssueMetadata(
      repo.id,
      3,
      {
        status: "todo",
        impact: null,
        urgency: null,
        priority: null,
        size: null,
        blocked: false,
        labelConflict: true,
      },
      vocabulary,
    );
    expect(mirror.getIssue(repo.id, 3)?.isEpic).toBe(1);

    // An old unprefixed epic name is an ordinary label once a prefix is set.
    mirror.upsertIssue(
      { ...record, externalId: "7202", number: 4, labels: ["epic", "todo"] },
      {
        status: "todo",
        impact: null,
        urgency: null,
        priority: null,
        size: null,
        blocked: false,
        labelConflict: false,
      },
      vocabulary,
    );
    expect(mirror.getIssue(repo.id, 4)?.isEpic).toBe(0);
  });

  test("replaces labels and assignees on re-hydration", () => {
    const repo = seedRepo();
    seedIssue(repo.id, 1, 1000);
    expect(mirror.getIssueLabels(repo.id, 1)).toEqual(["todo"]);

    mirror.upsertIssue(
      {
        externalId: "1001",
        repoId: repo.id,
        number: 1,
        kind: "issue",
        title: "issue 1",
        body: "edited",
        state: "open",
        stateReason: null,
        author: null,
        milestoneNumber: null,
        url: "https://github.com/orgA/core/issues/1",
        createdAt: 1000,
        updatedAt: 2000,
        closedAt: null,
        labels: ["in-progress"],
        assignees: [],
        comments: [],
      },
      { status: "in-progress", impact: null, urgency: null, priority: null, size: null, blocked: false, labelConflict: false },
    );

    const issue = mirror.getIssue(repo.id, 1);
    expect(issue?.body).toBe("edited");
    expect(issue?.status).toBe("in-progress");
    expect(issue?.kind).toBe("issue");
    expect(issue?.externalId).toBe("1001");
    expect(issue?.url).toBe("https://github.com/orgA/core/issues/1");
    expect(mirror.getIssueLabels(repo.id, 1)).toEqual(["in-progress"]);
  });

  test("resolves author, assignee and comment authors to internal user ids", () => {
    const repo = seedRepo();
    const author = user("101", "octocat");
    const assignee = user("202", "dev");
    mirror.upsertIssue(
      {
        externalId: "9001",
        repoId: repo.id,
        number: 1,
        kind: "issue",
        title: "owned",
        body: "",
        state: "open",
        stateReason: null,
        author,
        milestoneNumber: null,
        url: "https://github.com/orgA/core/issues/1",
        createdAt: 1,
        updatedAt: 2,
        closedAt: null,
        labels: [],
        assignees: [assignee],
        comments: [
          {
            externalId: "500",
            author,
            body: "hi",
            createdAt: 3,
            updatedAt: 3,
          },
        ],
      },
      {
        status: null,
        impact: null,
        urgency: null,
        priority: null,
        size: null,
        blocked: false,
        labelConflict: false,
      },
    );

    const storedAuthor = mirror.getUser("101", "github", "github.com");
    const storedAssignee = mirror.getUser("202", "github", "github.com");
    expect(storedAuthor).toBeDefined();
    expect(storedAssignee).toBeDefined();

    expect(mirror.getIssue(repo.id, 1)?.authorId).toBe(storedAuthor!.id);
    expect(
      db
        .select()
        .from(mirrorThreadAssignee)
        .all()
        .map((row) => row.userId),
    ).toEqual([storedAssignee!.id]);
    expect(db.select().from(mirrorComment).get()).toMatchObject({
      repoId: repo.id,
      threadNumber: 1,
      externalId: "500",
      authorId: storedAuthor!.id,
      body: "hi",
    });
  });
});

describe("comment reconciliation", () => {
  const metadata: mirror.StoredMetadata = {
    status: null,
    impact: null,
    urgency: null,
    priority: null,
    size: null,
    blocked: false,
    labelConflict: false,
  };
  const record = (
    repoId: number,
    number: number,
    comments: Array<{
      externalId: string;
      body: string;
      reactions?: mirror.CommentRecord["reactions"];
    }>,
  ): mirror.IssueRecord => ({
    externalId: String(9000 + number),
    repoId,
    number,
    kind: "issue",
    title: `issue ${number}`,
    body: "",
    state: "open",
    stateReason: null,
    author: null,
    milestoneNumber: null,
    url: `https://github.com/orgA/core/issues/${number}`,
    createdAt: 1,
    updatedAt: 2,
    closedAt: null,
    labels: [],
    assignees: [],
    comments: comments.map((c) => ({
      ...c,
      author: null,
      createdAt: 3,
      updatedAt: 4,
    })),
  });

  test("reconciles deleted and edited comments", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, [
        { externalId: "1", body: "one" },
        { externalId: "2", body: "two" },
      ]),
      metadata,
    );
    mirror.upsertIssue(
      record(repo.id, 1, [{ externalId: "1", body: "one edited" }]),
      metadata,
    );

    expect(
      mirror.getIssueComments(repo.id, 1).map((c) => [c.externalId, c.body]),
    ).toEqual([["1", "one edited"]]);
  });

  test("an edit overwrites body and updatedAt but preserves createdAt", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, [{ externalId: "1", body: "one" }]),
      metadata,
    );

    const edited = record(repo.id, 1, [{ externalId: "1", body: "one edited" }]);
    edited.comments[0].updatedAt = 99;
    mirror.upsertIssue(edited, metadata);

    const rows = db.select().from(mirrorComment).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      repoId: repo.id,
      threadNumber: 1,
      externalId: "1",
      body: "one edited",
      createdAt: 3,
      updatedAt: 99,
    });
  });

  test("stores and replaces the aggregated reaction summary", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, [
        {
          externalId: "1",
          body: "one",
          reactions: {
            total: 2,
            counts: { heart: 2 },
            viewerReacted: [],
          },
        },
      ]),
      metadata,
    );

    expect(db.select().from(mirrorComment).get()?.reactions).toEqual({
      total: 2,
      counts: { heart: 2 },
      viewerReacted: [],
    });

    mirror.upsertIssue(
      record(repo.id, 1, [
        {
          externalId: "1",
          body: "one",
          reactions: { total: 0, counts: {}, viewerReacted: [] },
        },
      ]),
      metadata,
    );
    expect(db.select().from(mirrorComment).get()?.reactions).toEqual({
      total: 0,
      counts: {},
      viewerReacted: [],
    });
  });

  test("an empty incoming list clears the thread's comments", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, [
        { externalId: "1", body: "one" },
        { externalId: "2", body: "two" },
      ]),
      metadata,
    );
    mirror.upsertIssue(record(repo.id, 1, []), metadata);

    expect(mirror.getIssueComments(repo.id, 1)).toEqual([]);
  });

  test("reconciling one issue leaves other issues' comments intact", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, [
        { externalId: "1", body: "one" },
        { externalId: "2", body: "two" },
      ]),
      metadata,
    );
    mirror.upsertIssue(
      record(repo.id, 2, [{ externalId: "3", body: "three" }]),
      metadata,
    );

    mirror.upsertIssue(
      record(repo.id, 1, [{ externalId: "1", body: "one" }]),
      metadata,
    );

    expect(
      mirror.getIssueComments(repo.id, 1).map((c) => c.externalId),
    ).toEqual(["1"]);
    expect(
      mirror.getIssueComments(repo.id, 2).map((c) => c.externalId),
    ).toEqual(["3"]);
  });

  test("deletes more stale ids than SQLite's bound-variable limit", () => {
    const repo = seedRepo();
    const many = Array.from({ length: 1000 }, (_, i) => ({
      externalId: `c${i + 1}`,
      body: `body ${i + 1}`,
    }));
    mirror.upsertIssue(record(repo.id, 1, many), metadata);
    expect(mirror.getIssueComments(repo.id, 1)).toHaveLength(1000);

    mirror.upsertIssue(
      record(repo.id, 1, [{ externalId: "c1", body: "kept" }]),
      metadata,
    );

    expect(
      mirror.getIssueComments(repo.id, 1).map((c) => c.externalId),
    ).toEqual(["c1"]);
  });

  test("a throw during the upsert rolls back the whole issue", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, [
        { externalId: "1", body: "one" },
        { externalId: "2", body: "two" },
      ]),
      metadata,
    );

    const broken = record(repo.id, 1, [{ externalId: "1", body: "edited" }]);
    broken.comments.push({
      externalId: null as unknown as string,
      author: null,
      body: "bad",
      createdAt: 3,
      updatedAt: 4,
    });
    expect(() => mirror.upsertIssue(broken, metadata)).toThrow();

    expect(
      mirror.getIssueComments(repo.id, 1).map((c) => [c.externalId, c.body]),
    ).toEqual([
      ["1", "one"],
      ["2", "two"],
    ]);
  });
});

describe("search index", () => {
  const metadata: mirror.StoredMetadata = {
    status: null,
    impact: null,
    urgency: null,
    priority: null,
    size: null,
    blocked: false,
    labelConflict: false,
  };

  function record(
    repoId: number,
    number: number,
    input: {
      title?: string;
      body?: string;
      comments?: Array<{ externalId: string; body: string }>;
    } = {},
  ): mirror.IssueRecord {
    return {
      externalId: String(9000 + number),
      repoId,
      number,
      kind: "issue",
      title: input.title ?? `issue ${number}`,
      body: input.body ?? "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: "",
      createdAt: 1,
      updatedAt: 2,
      closedAt: null,
      labels: [],
      assignees: [],
      comments: (input.comments ?? []).map((comment) => ({
        ...comment,
        author: null,
        createdAt: 3,
        updatedAt: 4,
      })),
    };
  }

  function searchRows(
    repoId: number,
    number: number,
  ): Array<{ title: string; body: string; comments: string }> {
    return db.$client
      .query(
        "SELECT title, body, comments FROM mirror_thread_fts WHERE repo_id = ? AND number = ?",
      )
      .all(repoId, number) as Array<{
      title: string;
      body: string;
      comments: string;
    }>;
  }

  test("indexes title, body and every comment; re-sync replaces one row", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, {
        title: "Original title",
        body: "Original body",
        comments: [
          { externalId: "1", body: "old comment secret" },
          { externalId: "2", body: "second comment" },
        ],
      }),
      metadata,
    );

    expect(searchRows(repo.id, 1)).toEqual([
      {
        title: "Original title",
        body: "Original body",
        comments: "old comment secret\nsecond comment",
      },
    ]);

    // A re-sync is an idempotent replace, not a duplicate row.
    mirror.upsertIssue(
      record(repo.id, 1, {
        title: "Original title",
        body: "Original body",
        comments: [{ externalId: "1", body: "old comment secret" }],
      }),
      metadata,
    );
    expect(searchRows(repo.id, 1)).toHaveLength(1);
  });

  test("updates after title/body edits and comment add/edit/delete", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, {
        title: "Before",
        body: "old body",
        comments: [{ externalId: "1", body: "first wording" }],
      }),
      metadata,
    );

    mirror.upsertIssue(
      record(repo.id, 1, {
        title: "After",
        body: "new body",
        comments: [
          { externalId: "1", body: "edited wording" },
          { externalId: "2", body: "brand new comment" },
        ],
      }),
      metadata,
    );

    expect(searchRows(repo.id, 1)).toEqual([
      {
        title: "After",
        body: "new body",
        comments: "edited wording\nbrand new comment",
      },
    ]);

    mirror.upsertIssue(
      record(repo.id, 1, {
        title: "After",
        body: "new body",
        comments: [{ externalId: "2", body: "brand new comment" }],
      }),
      metadata,
    );
    expect(searchRows(repo.id, 1)[0]?.comments).toBe("brand new comment");
  });

  test("removes the row on deleteIssue and deleteIssuesNotIn", () => {
    const repo = seedRepo();
    seedIssue(repo.id, 1, 1000);
    seedIssue(repo.id, 2, 2000);
    seedIssue(repo.id, 3, 3000);
    expect(searchRows(repo.id, 1)).toHaveLength(1);

    mirror.deleteIssue(repo.id, 1);
    expect(searchRows(repo.id, 1)).toEqual([]);

    mirror.deleteIssuesNotIn(repo.id, [3]);
    expect(searchRows(repo.id, 2)).toEqual([]);
    expect(searchRows(repo.id, 3)).toHaveLength(1);
  });

  test("refreshIssueSearchIndex rebuilds after a direct content write", () => {
    const repo = seedRepo();
    mirror.upsertIssue(
      record(repo.id, 1, { title: "Before", comments: [] }),
      metadata,
    );

    db.update(mirrorThread)
      .set({ title: "Direct edit" })
      .where(
        sql`${mirrorThread.repoId} = ${repo.id} AND ${mirrorThread.number} = 1`,
      )
      .run();
    mirror.refreshIssueSearchIndex(repo.id, 1);

    expect(searchRows(repo.id, 1)[0]?.title).toBe("Direct edit");
  });
});

describe("pruning", () => {
  test("deleteIssuesNotIn removes only absent rows", () => {
    const repo = seedRepo();
    seedIssue(repo.id, 1, 1000);
    seedIssue(repo.id, 2, 2000);
    seedIssue(repo.id, 3, 3000);

    const removed = mirror.deleteIssuesNotIn(repo.id, [1, 3]);

    expect(removed).toBe(1);
    expect(mirror.getIssue(repo.id, 2)).toBeUndefined();
    expect(mirror.getIssue(repo.id, 1)).toBeDefined();
    expect(mirror.getIssue(repo.id, 3)).toBeDefined();
  });
});

describe("repo labels", () => {
  test("replaces the full set", () => {
    const repo = seedRepo();
    mirror.replaceRepoLabels(repo.id, [
      { name: "bug", color: "ff0000", description: "" },
    ]);
    expect(mirror.getRepoLabels(repo.id)).toEqual([
      { name: "bug", color: "ff0000", description: "" },
    ]);

    mirror.replaceRepoLabels(repo.id, [
      { name: "todo", color: "78a9ff", description: "Status: Todo" },
    ]);
    expect(mirror.getRepoLabels(repo.id)).toEqual([
      { name: "todo", color: "78a9ff", description: "Status: Todo" },
    ]);
  });
});

describe("repo assignees", () => {
  test("upserts users and replaces the full set, sorted by login", () => {
    const repo = seedRepo();
    mirror.replaceRepoAssignees(repo.id, [
      user("42", "zoe"),
      user("41", "amy"),
    ]);
    expect(
      mirror.getRepoAssignees(repo.id).map((u) => [u.externalId, u.login]),
    ).toEqual([
      ["41", "amy"],
      ["42", "zoe"],
    ]);

    mirror.replaceRepoAssignees(repo.id, [user("43", "bob")]);
    expect(
      mirror.getRepoAssignees(repo.id).map((u) => [u.externalId, u.login]),
    ).toEqual([["43", "bob"]]);
  });
});

describe("repo milestones", () => {
  test("upserts the creator and replaces the full set", () => {
    const repo = seedRepo();
    mirror.replaceRepoMilestones(repo.id, [
      {
        number: 1,
        externalId: "10",
        title: "v1",
        description: "",
        state: "open",
        dueOn: 1000,
        openIssues: 2,
        closedIssues: 1,
        creator: user("7", "octocat"),
        createdAt: 1,
        updatedAt: 2,
        closedAt: null,
        url: "https://github.com/orgA/core/milestone/1",
      },
    ]);

    const storedCreator = mirror.getUser("7", "github", "github.com");
    const [milestone] = mirror.getRepoMilestones(repo.id);
    expect(milestone).toMatchObject({
      number: 1,
      externalId: "10",
      title: "v1",
      openIssues: 2,
      closedIssues: 1,
      url: "https://github.com/orgA/core/milestone/1",
      creator: {
        externalId: "7",
        forge: "github",
        instance: "github.com",
        login: "octocat",
        avatarUrl: "a-octocat",
      },
    });
    expect(milestone?.creator?.id).toBe(storedCreator!.id);

    mirror.replaceRepoMilestones(repo.id, []);
    expect(mirror.getRepoMilestones(repo.id)).toEqual([]);
  });

  test("leaves an unchanged set untouched", () => {
    const repo = seedRepo();
    const milestone: mirror.MilestoneRecord = {
      number: 1,
      externalId: "10",
      title: "v1",
      description: "",
      state: "open",
      dueOn: 1000,
      openIssues: 2,
      closedIssues: 1,
      creator: user("7", "octocat"),
      createdAt: 1,
      updatedAt: 2,
      closedAt: null,
      url: "https://github.com/orgA/core/milestone/1",
    };
    const rowid = () =>
      db.get<{ rowid: number }>(sql`select rowid from mirror_milestone`).rowid;

    mirror.replaceRepoMilestones(repo.id, [milestone]);
    const before = rowid();
    mirror.replaceRepoMilestones(repo.id, [{ ...milestone }]);

    expect(rowid()).toBe(before);
  });
});
