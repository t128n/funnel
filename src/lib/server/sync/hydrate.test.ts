import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { getConfig, resetConfigCache } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  authAccount,
  authUser,
  mirrorUser,
  stateIssueWatch,
  stateNotification,
} from "#lib/server/db/schema";
import { watchIssue } from "#lib/server/notifications/service";
import {
  clearSettings,
  writeSettings,
  type SettingsInput,
} from "#lib/server/settings/store";
import { clearMirror } from "#tests/mirror-helpers";
import { forge } from "#/lib/server/forge/providers.server";
import { deriveMetadata } from "./conflicts";
import type {
  NotificationDraft,
  PlanIssueInput,
  Recipient,
} from "#lib/server/notifications/types";
import {
  BATCH_SIZE,
  chunk,
  COMMENTS_QUERY,
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

const BASE_SETTINGS: SettingsInput = {
  repos: [],
  projects: [],
  intake: {},
  sync: {
    history_days: 90,
    poll_interval_active_seconds: 30,
    poll_interval_idle_seconds: 300,
  },
  board: { done_days: 14, wip_limits: {} },
  session: { idle_days: 30 },
  notifications: { enabled: true, native: true, new_intake: true },
};

let repoId = 0;

beforeEach(() => {
  clearMirror();
  clearSettings();
  resetConfigCache();
  db.delete(stateNotification).run();
  db.delete(stateIssueWatch).run();
  db.delete(authAccount).run();
  db.delete(authUser).run();
  repoId = mirror.upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  }).id;
});

function seedUser(
  id: string,
  externalId: string,
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
      accountId: externalId,
      providerId: "github",
      userId: id,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(mirrorUser)
    .values({
      externalId,
      forge: "github",
      instance: "github.com",
      login,
      avatarUrl: "",
      url: "",
    })
    .run();
}

function seedWatcher(): void {
  seedUser("w1", "42", "wanda");
}

const ISSUE_NODE = {
  databaseId: 101,
  number: 1,
  url: "https://github.com/orgA/core/issues/1",
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
    const record = normalizeNode(ISSUE_NODE, repoId);
    expect(record).toMatchObject({
      externalId: "101",
      repoId,
      number: 1,
      kind: "issue",
      url: "https://github.com/orgA/core/issues/1",
      title: "Fix the thing",
      state: "open",
      milestoneNumber: 3,
      labels: ["todo", "bug"],
      author: { externalId: "7", login: "octocat" },
    });
    expect(record?.assignees).toEqual([
      {
        id: 0,
        externalId: "8",
        forge: "github",
        instance: "github.com",
        login: "dev",
        avatarUrl: "https://a/8",
        url: "",
      },
    ]);
    expect(record?.comments).toEqual([
      {
        externalId: "500",
        author: {
          id: 0,
          externalId: "7",
          forge: "github",
          instance: "github.com",
          login: "octocat",
          avatarUrl: "https://a/7",
          url: "",
        },
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
    const records = await hydrateNodes(graphql, repoId, ids);

    expect(calls).toHaveLength(2);
    expect((calls[0].ids as string[]).length).toBe(BATCH_SIZE);
    expect(records).toHaveLength(BATCH_SIZE);
  });
});

const comment = (id: number) => ({
  databaseId: id,
  author: { databaseId: 7, login: "octocat", avatarUrl: "" },
  body: `c${id}`,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const issueNode = (comments: unknown) => ({
  databaseId: 101,
  number: 1,
  url: "https://github.com/orgA/core/issues/1",
  title: "Fix the thing",
  body: "",
  state: "OPEN",
  stateReason: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  closedAt: null,
  author: { databaseId: 7, login: "octocat", avatarUrl: "" },
  milestone: null,
  labels: { nodes: [] },
  assignees: { nodes: [] },
  comments,
});

describe("comment pagination", () => {
  test("follows every comment page and de-duplicates ids", async () => {
    const after: Array<string | null> = [];
    const graphql: GraphqlFn = async (_query, vars) => {
      const v = vars as { ids?: string[]; after?: string | null };
      if (v.ids) {
        return {
          nodes: [
            issueNode({
              pageInfo: { hasNextPage: true, endCursor: "c100" },
              nodes: Array.from({ length: 100 }, (_, i) => comment(i + 1)),
            }),
          ],
        };
      }
      after.push(v.after ?? null);
      if (v.after === "c100") {
        return {
          node: {
            comments: {
              pageInfo: { hasNextPage: true, endCursor: "c101" },
              nodes: [comment(100), comment(101)],
            },
          },
        };
      }
      return {
        node: {
          comments: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [comment(102)],
          },
        },
      };
    };

    const [record] = await hydrateNodes(graphql, 1, ["n1"]);
    expect(record.comments).toHaveLength(102);
    expect(record.comments.map((c) => c.externalId)).toEqual([
      ...Array.from({ length: 100 }, (_, i) => String(i + 1)),
      "101",
      "102",
    ]);
    expect(new Set(record.comments.map((c) => c.externalId)).size).toBe(102);
    expect(after).toEqual(["c100", "c101"]);
  });

  test("does not follow up when the first page is complete", async () => {
    let calls = 0;
    const graphql: GraphqlFn = async () => {
      calls += 1;
      return {
        nodes: [
          issueNode({
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [comment(1)],
          }),
        ],
      };
    };
    const [record] = await hydrateNodes(graphql, 1, ["n1"]);
    expect(record.comments).toHaveLength(1);
    expect(calls).toBe(1);
  });

  test("follows up with COMMENTS_QUERY and the node id plus cursor", async () => {
    const queries: string[] = [];
    const seen: Array<Record<string, unknown>> = [];
    const graphql: GraphqlFn = async (query, vars) => {
      queries.push(query);
      if (vars && "ids" in vars) {
        return {
          nodes: [
            issueNode({
              pageInfo: { hasNextPage: true, endCursor: "c1" },
              nodes: [comment(1)],
            }),
          ],
        };
      }
      seen.push(vars ?? {});
      return {
        node: {
          comments: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [comment(2)],
          },
        },
      };
    };

    const [record] = await hydrateNodes(graphql, 1, ["node-1"]);
    expect(queries).toEqual([HYDRATE_QUERY, COMMENTS_QUERY]);
    expect(seen).toEqual([{ id: "node-1", after: "c1" }]);
    expect(record.comments.map((c) => c.externalId)).toEqual(["1", "2"]);
  });

  test("throws when hasNextPage is true without an endCursor", async () => {
    const graphql: GraphqlFn = async () => ({
      nodes: [
        issueNode({
          pageInfo: { hasNextPage: true, endCursor: null },
          nodes: [comment(1)],
        }),
      ],
    });
    await expect(hydrateNodes(graphql, 1, ["n1"])).rejects.toThrow(
      /endCursor/,
    );
  });

  test("throws when a follow-up page is missing its endCursor", async () => {
    const graphql: GraphqlFn = async (_query, vars) => {
      if (vars && "ids" in vars) {
        return {
          nodes: [
            issueNode({
              pageInfo: { hasNextPage: true, endCursor: "c1" },
              nodes: [comment(1)],
            }),
          ],
        };
      }
      return {
        node: {
          comments: {
            pageInfo: { hasNextPage: true, endCursor: null },
            nodes: [comment(2)],
          },
        },
      };
    };
    await expect(hydrateNodes(graphql, 1, ["n1"])).rejects.toThrow(
      /endCursor/,
    );
  });

  test("throws instead of looping forever when pages never end", async () => {
    let page = 0;
    const graphql: GraphqlFn = async (_query, vars) => {
      if (vars && "ids" in vars) {
        return {
          nodes: [
            issueNode({
              pageInfo: { hasNextPage: true, endCursor: "c0" },
              nodes: [comment(1)],
            }),
          ],
        };
      }
      page += 1;
      return {
        node: {
          comments: {
            pageInfo: { hasNextPage: true, endCursor: `c${page}` },
            nodes: [comment(page + 1)],
          },
        },
      };
    };
    await expect(hydrateNodes(graphql, 1, ["n1"])).rejects.toThrow(/pages/);
  });

  test("throws before returning any record when pagination fails", async () => {
    const graphql: GraphqlFn = async (_query, vars) => {
      if (vars && "ids" in vars) {
        return {
          nodes: [
            issueNode({
              pageInfo: { hasNextPage: true, endCursor: null },
              nodes: [comment(1)],
            }),
          ],
        };
      }
      throw new Error("unreachable");
    };
    await expect(hydrateNodes(graphql, 1, ["n1"])).rejects.toThrow(
      /endCursor/,
    );
  });

  test("maps each follow-up to its own node id despite dropped PRs", async () => {
    const followUps: Array<{ id: unknown; after: unknown }> = [];
    const graphql: GraphqlFn = async (_query, vars) => {
      if (vars && "ids" in vars) {
        return {
          nodes: [
            issueNode({
              pageInfo: { hasNextPage: true, endCursor: "a" },
              nodes: [comment(1)],
            }),
            {},
            {
              ...issueNode({
                pageInfo: { hasNextPage: true, endCursor: "b" },
                nodes: [comment(2)],
              }),
              databaseId: 102,
            },
          ],
        };
      }
      const v = vars as { id: string; after: string };
      followUps.push({ id: v.id, after: v.after });
      const extra = v.id === "n1" ? 11 : 22;
      return {
        node: {
          comments: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [comment(extra)],
          },
        },
      };
    };

    const records = await hydrateNodes(graphql, 1, ["n1", "pr", "n2"]);
    expect(followUps).toEqual([
      { id: "n1", after: "a" },
      { id: "n2", after: "b" },
    ]);
    expect(records.map((r) => r.externalId)).toEqual(["101", "102"]);
    expect(records[0].comments.map((c) => c.externalId)).toEqual(["1", "11"]);
    expect(records[1].comments.map((c) => c.externalId)).toEqual(["2", "22"]);
  });

  test("throws when a follow-up page returns no node instead of persisting a partial list", async () => {
    const graphql: GraphqlFn = async (_query, vars) => {
      if (vars && "ids" in vars) {
        return {
          nodes: [
            issueNode({
              pageInfo: { hasNextPage: true, endCursor: "c1" },
              nodes: [comment(1)],
            }),
          ],
        };
      }
      return { node: null };
    };
    await expect(hydrateNodes(graphql, 1, ["n1"])).rejects.toThrow(
      /lost node/,
    );
  });
});

const METADATA = {
  status: null,
  impact: null,
  urgency: null,
  priority: null,
  size: null,
  blocked: false,
  labelConflict: false,
};

function issueRecord(overrides: Partial<mirror.IssueRecord> = {}): mirror.IssueRecord {
  return {
    externalId: "101",
    kind: "issue",
    url: "",
    repoId,
    number: 1,
    title: "Fix the thing",
    body: "",
    state: "open",
    stateReason: null,
    author: { id: 0, externalId: "7", forge: "github", instance: "github.com", login: "octocat", avatarUrl: "", url: "" },
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
  externalId: "42",
  login: "wanda",
  avatarUrl: "",
};
const ACTOR: Recipient = {
  userId: "a1",
  externalId: "7",
  login: "amy",
  avatarUrl: "",
};

describe("snapshotIssue", () => {
  test("maps the mirrored issue, assignees and comments", () => {
    mirror.upsertIssue(
      issueRecord({
        updatedAt: 1000,
        assignees: [{ id: 0, externalId: "42", forge: "github", instance: "github.com", login: "wanda", avatarUrl: "", url: "" }],
        comments: [
          {
            externalId: "500",
            author: { id: 0, externalId: "7", forge: "github", instance: "github.com", login: "octocat", avatarUrl: "https://a/7", url: "" },
            body: "hello",
            createdAt: 10,
            updatedAt: 10,
          },
        ],
      }),
      { ...METADATA, status: "in-progress", priority: "P2" },
    );

    expect(snapshotIssue(repoId, 1)).toEqual({
      status: "in-progress",
      priority: "P2",
      state: "open",
      updatedAt: 1000,
      assigneeIds: ["42"],
      comments: [
        {
          externalId: "500",
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
    priority: "P2",
    state: "open",
    updatedAt: 1000,
    assigneeIds: [] as string[],
    comments: [] as [],
  };
  const next = {
    status: "in-progress",
    priority: "P2",
    state: "open",
    updatedAt: 2000,
    assigneeIds: ["42"],
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
      input({ actorUserId: ACTOR.userId, next: { ...next, assigneeIds: ["7"] } }),
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
    const records = await hydrateAndStore(1, repoId, ["n1"], graphql);

    expect(records).toHaveLength(1);
    const stored = mirror.getIssue(repoId, 1);
    expect(stored?.title).toBe("Fix the thing");
    expect(stored?.externalId).toBe("101");
    expect(stored?.kind).toBe("issue");
    expect(stored?.url).toBe("https://github.com/orgA/core/issues/1");
    expect(stored?.status).toBe("todo");
    expect(stored?.labelConflict).toBe(0);
    expect(mirror.getIssueLabels(repoId, 1).sort()).toEqual(["bug", "todo"]);
  });

  test("caches impact/urgency labels and derives priority", async () => {
    const graphql: GraphqlFn = async () => ({
      nodes: [
        {
          ...ISSUE_NODE,
          labels: {
            nodes: [{ name: "todo" }, { name: "sev" }, { name: "high" }],
          },
        },
      ],
    });
    await hydrateAndStore(1, repoId, ["n1"], graphql);

    const stored = mirror.getIssue(repoId, 1);
    expect(stored?.impact).toBe(1);
    expect(stored?.urgency).toBe(1);
    expect(stored?.priority).toBe("P1");
    expect(stored?.labelConflict).toBe(0);
  });

  test("flags a retired p-label that disagrees with the axes", async () => {
    const graphql: GraphqlFn = async () => ({
      nodes: [
        {
          ...ISSUE_NODE,
          labels: {
            nodes: [
              { name: "todo" },
              { name: "min" },
              { name: "low" },
              { name: "p1" },
            ],
          },
        },
      ],
    });
    await hydrateAndStore(1, repoId, ["n1"], graphql);

    expect(mirror.getIssue(repoId, 1)?.priority).toBe("P3");
    expect(mirror.getIssue(repoId, 1)?.labelConflict).toBe(1);
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
    await hydrateAndStore(1, repoId, ["n1"], graphql);
    expect(mirror.getIssue(repoId, 1)?.labelConflict).toBe(1);
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
    expect(db.select().from(stateNotification).all()).toEqual([]);
  });

  test("snapshots the previous state before the upsert", async () => {
    await hydrateAndStore(1, 1, ["n1"], async () => ({ nodes: [ISSUE_NODE] }), {
      notificationsEnabled: () => true,
    });

    let seen: IssueChangeInput | undefined;
    await hydrateAndStore(
      1,
      1,
      ["n1"],
      async () => ({
        nodes: [
          { ...ISSUE_NODE, labels: { nodes: [{ name: "in-progress" }] } },
        ],
      }),
      {
        notificationsEnabled: () => true,
        notify: (input) => {
          seen = input;
          return 0;
        },
      },
    );

    expect(seen?.previous?.status).toBe("todo");
    expect(seen?.next.status).toBe("in-progress");
    expect(mirror.getIssue(1, 1)?.status).toBe("in-progress");
  });

  test("new assignment notifies the linked assignee once", async () => {
    seedUser("u1", "42", "alice");
    const unassigned: GraphqlFn = async () => ({
      nodes: [{ ...ISSUE_NODE, assignees: { nodes: [] } }],
    });
    const assigned: GraphqlFn = async () => ({
      nodes: [
        {
          ...ISSUE_NODE,
          assignees: {
            nodes: [{ databaseId: 42, login: "alice", avatarUrl: "" }],
          },
        },
      ],
    });
    const options = { notificationsEnabled: () => true };

    await hydrateAndStore(1, 1, ["n1"], unassigned, options);
    await hydrateAndStore(1, 1, ["n1"], assigned, options);
    // A re-poll of the boundary issue must not repeat the assignment.
    await hydrateAndStore(1, 1, ["n1"], assigned, options);

    const rows = db.select().from(stateNotification).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "u1",
      kind: "assigned",
      title: "Fix the thing",
      url: "/issues/orgA/core/1",
    });
  });

  test("new mention notifies a linked user without a watch", async () => {
    seedUser("u1", "42", "alice");
    const before: GraphqlFn = async () => ({ nodes: [ISSUE_NODE] });
    const after: GraphqlFn = async () => ({
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
                  avatarUrl: "https://a/7",
                },
                body: "hey @alice",
                createdAt: "2026-01-03T00:00:00Z",
                updatedAt: "2026-01-03T00:00:00Z",
              },
            ],
          },
        },
      ],
    });
    const options = { notificationsEnabled: () => true };

    await hydrateAndStore(1, 1, ["n1"], before, options);
    await hydrateAndStore(1, 1, ["n1"], after, options);
    await hydrateAndStore(1, 1, ["n1"], after, options);

    const rows = db.select().from(stateNotification).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "u1",
      kind: "mentioned",
      body: "hey @alice",
    });
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
    seedUser("a1", "7", "amy");
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

  test("the disabled master switch suppresses sync rows", async () => {
    seedWatcher();
    watchIssue("w1", "orgA", "core", 1);
    await hydrateAndStore(
      1,
      1,
      ["n1"],
      async () => ({ nodes: [ISSUE_NODE] }),
      { notificationsEnabled: () => true },
    );

    writeSettings({
      ...BASE_SETTINGS,
      notifications: { enabled: false, native: true, new_intake: true },
    });
    resetConfigCache();
    await hydrateAndStore(
      1,
      1,
      ["n1"],
      async () => ({
        nodes: [{ ...ISSUE_NODE, state: "CLOSED" }],
      }),
    );

    expect(db.select().from(stateNotification).all()).toEqual([]);
  });

  test("the disabled master switch wins when the instance config is invalid", async () => {
    seedWatcher();
    watchIssue("w1", "orgA", "core", 1);
    await hydrateAndStore(
      1,
      1,
      ["n1"],
      async () => ({ nodes: [ISSUE_NODE] }),
      { notificationsEnabled: () => true },
    );

    writeSettings({
      ...BASE_SETTINGS,
      repos: [
        { repo: "orgA/core", shortcode: "CORE" },
        { repo: "orgB/core", shortcode: "CORE" },
      ],
      notifications: { enabled: false, native: true, new_intake: true },
    });
    resetConfigCache();
    // The invalid duplicate shortcodes make the validated config unusable;
    // the notification switch must still be read directly from settings.
    await expect(getConfig()).rejects.toThrow();

    await hydrateAndStore(
      1,
      1,
      ["n1"],
      async () => ({
        nodes: [{ ...ISSUE_NODE, state: "CLOSED" }],
      }),
    );

    expect(db.select().from(stateNotification).all()).toEqual([]);
  });
});

const fakeGraphql = async () => ({
  nodes: [{ databaseId: 101, number: 1, url: "https://github.com/orgA/core/issues/1", title: "live", state: "OPEN", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", labels: { nodes: [] }, assignees: { nodes: [] }, comments: { nodes: [] } }],
});

describe("hydrateAndStore injection", () => {
  test("stores normalized nodes from the injected graphql", async () => {
    const records = await hydrateAndStore(7, repoId, ["n1"], fakeGraphql as never);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      externalId: "101",
      number: 1,
      title: "live",
    });
  });
  test("does nothing for an empty batch", async () => {
    expect(await hydrateAndStore(7, repoId, [], fakeGraphql as never)).toEqual([]);
  });
});

describe("hydrateAndStore provider", () => {
  const provider = {
    marker: "provider",
    async graphql(_query: string, _variables?: Record<string, unknown>) {
      // An unbound method call would lose `this`.
      expect(this.marker).toBe("provider");
      return { nodes: [ISSUE_NODE] };
    },
  };
  let providerSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    providerSpy = spyOn(forge, "installationProvider").mockResolvedValue(
      provider as never,
    );
  });

  afterEach(() => {
    providerSpy.mockRestore();
  });

  test("calls the provider graphql through a bound function", async () => {
    const records = await hydrateAndStore(7, repoId, ["n1"]);

    expect(providerSpy).toHaveBeenCalledWith(7);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ externalId: "101", number: 1 });
  });
});
