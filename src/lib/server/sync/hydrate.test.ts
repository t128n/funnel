import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import {
  authAccount,
  authUser,
  mirrorGithubUser,
  stateIssueWatch,
  stateNotification,
} from "#lib/server/db/schema";
import { watchIssue } from "#lib/server/notifications/service";
import { clearMirror } from "#tests/mirror-helpers";
import { deriveMetadata } from "./conflicts";
import type {
  NotificationDraft,
  PlanIssueInput,
  Recipient,
} from "#lib/server/notifications/types";
import {
  BATCH_SIZE,
  chunk,
  HYDRATE_QUERY,
  hydrateAndStore,
  hydrateNodes,
  normalizeNode,
  notifyIssueChanges,
  snapshotIssue,
  type GraphqlFn,
  type IssueChangeInput,
} from "./hydrate";
import * as mirror from "./mirror";

beforeEach(() => {
  clearMirror();
  db.delete(stateNotification).run();
  db.delete(stateIssueWatch).run();
  db.delete(authAccount).run();
  db.delete(authUser).run();
  mirror.upsertRepo({ githubId: 1, org: "orgA", name: "core", archived: false });
});

function seedUser(
  id: string,
  githubId: number,
  login: string,
): void {
  const now = new Date();
  db.insert(authUser)
    .values({
      id,
      name: login,
      email: `${login}@example.com`,
      role: "read",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(authAccount)
    .values({
      id: `account-${id}`,
      accountId: String(githubId),
      providerId: "github",
      userId: id,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(mirrorGithubUser)
    .values({ githubId, login, avatarUrl: "" })
    .run();
}

function seedWatcher(): void {
  seedUser("w1", 42, "wanda");
}

const ISSUE_NODE = {
  databaseId: 101,
  number: 1,
  title: "Fix the thing",
  body: "Body text",
  state: "OPEN",
  stateReason: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  closedAt: null,
  author: { databaseId: 7, login: "octocat", avatarUrl: "https://a/7" },
  milestone: { number: 3 },
  labels: { nodes: [{ name: "todo" }, { name: "bug" }] },
  assignees: { nodes: [{ databaseId: 8, login: "dev", avatarUrl: "https://a/8" }] },
  comments: {
    nodes: [
      {
        databaseId: 500,
        author: { databaseId: 7, login: "octocat", avatarUrl: "https://a/7" },
        body: "a comment",
        createdAt: "2026-01-02T00:00:00Z",
        updatedAt: "2026-01-02T01:00:00Z",
      },
    ],
  },
};

describe("normalizeNode", () => {
  test("maps a GraphQL issue node to a mirror record", () => {
    const record = normalizeNode(ISSUE_NODE, 1);
    expect(record).toMatchObject({
      githubId: 101,
      repoId: 1,
      number: 1,
      title: "Fix the thing",
      state: "open",
      milestoneNumber: 3,
      labels: ["todo", "bug"],
      author: { githubId: 7, login: "octocat" },
    });
    expect(record?.assignees).toEqual([
      { githubId: 8, login: "dev", avatarUrl: "https://a/8" },
    ]);
    expect(record?.comments).toEqual([
      {
        githubId: 500,
        author: { githubId: 7, login: "octocat", avatarUrl: "https://a/7" },
        body: "a comment",
        createdAt: Date.parse("2026-01-02T00:00:00Z"),
        updatedAt: Date.parse("2026-01-02T01:00:00Z"),
      },
    ]);
    expect(record?.updatedAt).toBe(Date.parse("2026-01-02T00:00:00Z"));
  });

  test("lowercases GraphQL state enum values (Inbox/board predicates)", () => {
    const record = normalizeNode(
      {
        ...ISSUE_NODE,
        state: "CLOSED",
        stateReason: "COMPLETED",
        closedAt: "2026-01-03T00:00:00Z",
      },
      1,
    );
    expect(record?.state).toBe("closed");
    expect(record?.stateReason).toBe("completed");
  });

  test("drops pull requests (empty node from the Issue fragment)", () => {
    expect(normalizeNode({}, 1)).toBeNull();
    expect(normalizeNode(null, 1)).toBeNull();
  });

  test("drops actors without a numeric databaseId", () => {
    const record = normalizeNode(
      { ...ISSUE_NODE, author: { login: "dependabot" } },
      1,
    );
    expect(record?.author).toBeNull();
  });
});

describe("chunk", () => {
  test("splits into fixed-size batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});

describe("hydrateNodes", () => {
  test("issues one query per 100 ids and drops PRs", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const graphql: GraphqlFn = async (query, variables) => {
      expect(query).toBe(HYDRATE_QUERY);
      calls.push(variables ?? {});
      const ids = (variables?.ids ?? []) as string[];
      return {
        nodes: ids.map((id) =>
          id === "pr" ? {} : { ...ISSUE_NODE, databaseId: Number(id) },
        ),
      };
    };

    const ids = [
      ...Array.from({ length: BATCH_SIZE }, (_, i) => String(i + 1)),
      "pr",
    ];
    const records = await hydrateNodes(graphql, 1, ids);

    expect(calls).toHaveLength(2);
    expect((calls[0].ids as string[]).length).toBe(BATCH_SIZE);
    expect(records).toHaveLength(BATCH_SIZE);
  });
});

const METADATA = {
  status: null,
  priority: null,
  size: null,
  blocked: false,
  labelConflict: false,
};

function issueRecord(overrides: Partial<mirror.IssueRecord> = {}): mirror.IssueRecord {
  return {
    githubId: 101,
    repoId: 1,
    number: 1,
    title: "Fix the thing",
    body: "",
    state: "open",
    stateReason: null,
    author: { githubId: 7, login: "octocat", avatarUrl: "" },
    milestoneNumber: null,
    createdAt: 1,
    updatedAt: 2,
    closedAt: null,
    labels: [],
    assignees: [],
    comments: [],
    ...overrides,
  };
}

const WATCHER: Recipient = {
  userId: "w1",
  githubId: 42,
  login: "wanda",
  avatarUrl: "",
};
const ACTOR: Recipient = {
  userId: "a1",
  githubId: 7,
  login: "amy",
  avatarUrl: "",
};

describe("snapshotIssue", () => {
  test("maps the mirrored issue, assignees and comments", () => {
    mirror.upsertIssue(
      issueRecord({
        updatedAt: 1000,
        assignees: [{ githubId: 42, login: "wanda", avatarUrl: "" }],
        comments: [
          {
            githubId: 500,
            author: { githubId: 7, login: "octocat", avatarUrl: "https://a/7" },
            body: "hello",
            createdAt: 10,
            updatedAt: 10,
          },
        ],
      }),
      { ...METADATA, status: "in-progress", priority: "p2" },
    );

    expect(snapshotIssue(1, 1)).toEqual({
      status: "in-progress",
      priority: "p2",
      state: "open",
      updatedAt: 1000,
      assigneeIds: [42],
      comments: [
        {
          githubId: 500,
          body: "hello",
          authorLogin: "octocat",
          authorAvatarUrl: "https://a/7",
        },
      ],
      title: "Fix the thing",
      number: 1,
    });
  });

  test("returns null for an issue that is not mirrored", () => {
    expect(snapshotIssue(1, 99)).toBeNull();
  });
});

describe("notifyIssueChanges", () => {
  const previous = {
    status: "todo",
    priority: "p2",
    state: "open",
    updatedAt: 1000,
    assigneeIds: [] as number[],
    comments: [] as [],
  };
  const next = {
    status: "in-progress",
    priority: "p2",
    state: "open",
    updatedAt: 2000,
    assigneeIds: [42],
    comments: [] as [],
  };

  function input(overrides: Partial<IssueChangeInput> = {}): IssueChangeInput {
    return {
      repoId: 1,
      org: "orgA",
      name: "core",
      number: 7,
      previous,
      next,
      ...overrides,
    };
  }

  test("test_first_sight_is_silent", () => {
    let planned = 0;
    const created = notifyIssueChanges(input({ previous: null }), {
      listWatchers: () => [WATCHER],
      planIssueNotifications: () => {
        planned += 1;
        return [];
      },
      createNotifications: () => {
        throw new Error("nothing should be stored");
      },
    });

    expect(created).toBe(0);
    expect(planned).toBe(0);
  });

  test("hands the diff, watchers and repo to the planner", () => {
    const plans: PlanIssueInput[] = [];
    const drafts: NotificationDraft[] = [
      {
        userId: "w1",
        kind: "status",
        dedupeKey: "status:orgA/core#7:w1:2000",
        createdAt: 2000,
      },
    ];
    const created = notifyIssueChanges(input(), {
      listWatchers: () => [WATCHER],
      planIssueNotifications: (planInput) => {
        plans.push(planInput);
        return drafts;
      },
      createNotifications: (batch) => batch.length,
      now: 2000,
    });

    expect(created).toBe(1);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      previous,
      next,
      repo: "orgA/core",
      watchers: [WATCHER],
      now: 2000,
    });
  });

  test("test_self_write_is_silent", () => {
    const drafts: NotificationDraft[] = [
      {
        userId: ACTOR.userId,
        kind: "assigned",
        dedupeKey: "assigned:orgA/core#7:a1:2000",
        createdAt: 2000,
      },
      {
        userId: WATCHER.userId,
        kind: "assigned",
        dedupeKey: "assigned:orgA/core#7:w1:2000",
        createdAt: 2000,
      },
    ];
    const stored: NotificationDraft[] = [];
    const created = notifyIssueChanges(
      input({ actorUserId: ACTOR.userId, next: { ...next, assigneeIds: [7] } }),
      {
        actor: ACTOR,
        recipients: [ACTOR, WATCHER],
        listWatchers: () => [WATCHER],
        planIssueNotifications: () => drafts,
        createNotifications: (batch) => {
          stored.push(...batch);
          return batch.length;
        },
      },
    );

    expect(created).toBe(1);
    expect(stored.map((draft) => draft.userId)).toEqual([WATCHER.userId]);
  });
});

describe("hydrateAndStore", () => {
  test("persists records with derived metadata", async () => {
    const graphql: GraphqlFn = async () => ({ nodes: [ISSUE_NODE] });
    const records = await hydrateAndStore(1, 1, ["n1"], graphql);

    expect(records).toHaveLength(1);
    const stored = mirror.getIssue(1, 1);
    expect(stored?.title).toBe("Fix the thing");
    expect(stored?.status).toBe("todo");
    expect(stored?.labelConflict).toBe(0);
    expect(mirror.getIssueLabels(1, 1).sort()).toEqual(["bug", "todo"]);
  });

  test("flags a conflicted label set for later resolution", async () => {
    const graphql: GraphqlFn = async () => ({
      nodes: [
        {
          ...ISSUE_NODE,
          labels: { nodes: [{ name: "todo" }, { name: "in-progress" }] },
        },
      ],
    });
    await hydrateAndStore(1, 1, ["n1"], graphql);
    expect(mirror.getIssue(1, 1)?.labelConflict).toBe(1);
    expect(deriveMetadata(["todo", "in-progress"]).conflicts).toEqual(["status"]);
  });

  test("test_first_sight_is_silent", async () => {
    const calls: IssueChangeInput[] = [];
    const graphql: GraphqlFn = async () => ({ nodes: [ISSUE_NODE] });

    await hydrateAndStore(1, 1, ["n1"], graphql, {
      notificationsEnabled: () => true,
      notify: (input) => {
        calls.push(input);
        return 1;
      },
    });

    expect(mirror.getIssue(1, 1)?.title).toBe("Fix the thing");
    expect(calls).toEqual([]);
  });

  test("test_new_comment_notifies_watcher_once", async () => {
    seedWatcher();
    watchIssue("w1", "orgA", "core", 1);

    const first: GraphqlFn = async () => ({ nodes: [ISSUE_NODE] });
    const second: GraphqlFn = async () => ({
      nodes: [
        {
          ...ISSUE_NODE,
          comments: {
            nodes: [
              ...ISSUE_NODE.comments.nodes,
              {
                databaseId: 501,
                author: {
                  databaseId: 7,
                  login: "octocat",
                  avatarUrl: "",
                },
                body: "a new comment",
                createdAt: "2026-01-03T00:00:00Z",
                updatedAt: "2026-01-03T00:00:00Z",
              },
            ],
          },
        },
      ],
    });

    const options = { notificationsEnabled: () => true };
    await hydrateAndStore(1, 1, ["n1"], first, options);
    await hydrateAndStore(1, 1, ["n1"], second, options);
    // GitHub re-sends the boundary issue; the diff is empty, so nothing new lands.
    await hydrateAndStore(1, 1, ["n1"], second, options);

    const rows = db.select().from(stateNotification).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "w1",
      kind: "comment",
      dedupeKey: "comment:orgA/core#1:w1:501",
    });
  });

  test("test_self_write_is_silent", async () => {
    seedWatcher();
    seedUser("a1", 7, "amy");
    watchIssue("w1", "orgA", "core", 1);
    watchIssue("a1", "orgA", "core", 1);

    await hydrateAndStore(
      1,
      1,
      ["n1"],
      async () => ({
        nodes: [
          {
            ...ISSUE_NODE,
            labels: { nodes: [{ name: "todo" }] },
          },
        ],
      }),
      { notificationsEnabled: () => true },
    );
    await hydrateAndStore(
      1,
      1,
      ["n1"],
      async () => ({
        nodes: [
          {
            ...ISSUE_NODE,
            labels: { nodes: [{ name: "in-progress" }] },
          },
        ],
      }),
      { actorUserId: "a1", notificationsEnabled: () => true },
    );

    const rows = db.select().from(stateNotification).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "w1",
      kind: "status",
      body: "status changed from todo to in-progress",
    });
  });

  test("skips the hook when notifications are disabled", async () => {
    const graphql: GraphqlFn = async () => ({ nodes: [ISSUE_NODE] });
    await hydrateAndStore(1, 1, ["n1"], graphql);
    const calls: IssueChangeInput[] = [];

    await hydrateAndStore(
      1,
      1,
      ["n1"],
      async () => ({
        nodes: [
          {
            ...ISSUE_NODE,
            state: "CLOSED",
            comments: {
              nodes: [
                ...ISSUE_NODE.comments.nodes,
                {
                  databaseId: 502,
                  author: { databaseId: 42, login: "wanda", avatarUrl: "" },
                  body: "closed",
                  createdAt: "2026-01-04T00:00:00Z",
                  updatedAt: "2026-01-04T00:00:00Z",
                },
              ],
            },
          },
        ],
      }),
      {
        notificationsEnabled: () => false,
        notify: (input) => {
          calls.push(input);
          return 1;
        },
      },
    );

    expect(calls).toEqual([]);
  });
});
