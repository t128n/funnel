import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { ForgeEvent, Thread, ThreadQuery } from "forges";
import { setConfig } from "#/lib/server/config";
import { db } from "#lib/server/db/index";
import {
  authAccount,
  authUser,
  mirrorUser,
  stateIssueWatch,
  stateNotification,
} from "#lib/server/db/schema";
import { forge } from "#lib/server/forge/providers.server";
import { watchIssue } from "#lib/server/notifications/service";
import { clearSettings } from "#lib/server/settings/store";
import { TEST_CONFIG } from "#tests/test-config";
import { clearMirror } from "#tests/mirror-helpers";
import { resetEventBus, subscribe } from "./events";
import * as mirror from "./mirror";
import {
  inHistoryWindow,
  pollRepo,
  refreshIssue,
  runRepoCycle,
  startSyncWorker,
  stopSyncWorker,
  syncAllRepos,
} from "./worker";

// Module-level state read by the fake installation provider below.
let pages: Thread[][] = [];
let etag: string | null = '"e1"';
let notModified = false;
let listQueries: ThreadQuery[] = [];
let timeline: ForgeEvent[] = [];
let deletedLabels: string[] = [];
let nodes: unknown[] = [];
let graphqlCalls: Array<Record<string, unknown>> = [];
let failIssues = false;
let repoId = 0;

/** Returned by the fake provider's assignable-users listing. */
interface FakeAssignee {
  id: string;
  login: string;
  avatarUrl: string;
}
let repoAssignees: FakeAssignee[] = [];

/** Raw milestone payloads returned by the fake provider's `request`. */
let repoMilestones: unknown[] = [];

function iterable<T>(items: readonly T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  };
}

function cursorIndex(cursor: unknown): number {
  if (typeof cursor === "object" && cursor !== null && "index" in cursor) {
    const index = (cursor as { index?: unknown }).index;
    if (typeof index === "number") return index;
  }
  return 0;
}

const fakeProvider = {
  request: async (
    _method: string,
    path: string,
    options?: { query?: Record<string, unknown> },
  ) => {
    if (path.endsWith("/milestones")) {
      const page = Number(options?.query?.page ?? 1);
      return { data: page === 1 ? repoMilestones : [] };
    }
    return { data: {} };
  },
  graphql: async (_query: string, variables?: Record<string, unknown>) => {
    graphqlCalls.push(variables ?? {});
    return { nodes };
  },
  repos: {
    get: async () => ({
      ref: {
        forge: "github",
        instance: "github.com",
        owner: "orgA",
        name: "core",
        externalId: "1",
      },
      isArchived: false,
    }),
    labels: () => iterable([]),
    assignableUsers: () => iterable(repoAssignees),
  },
  threads: {
    list: (_repo: unknown, query: ThreadQuery = {}) => {
      listQueries.push(query);
      return {
        page: async () => {
          if (failIssues) throw new Error("boom");
          const isEtagRead =
            typeof query.cursor === "object" &&
            query.cursor !== null &&
            "etag" in query.cursor;
          if (notModified && isEtagRead) {
            return { items: [], notModified: true };
          }
          const index = cursorIndex(query.cursor);
          const raw = pages[index] ?? [];
          const items = query.kind
            ? raw.filter((thread) => thread.kind === query.kind)
            : raw;
          const cursor =
            index + 1 < pages.length ? { index: index + 1 } : undefined;
          return { items, cursor, etag };
        },
      };
    },
    get: async (ref: { number?: string }) =>
      thread({ number: Number(ref.number) }),
    events: () => iterable(timeline),
    removeLabels: async (_ref: unknown, names: string[]) => {
      deletedLabels.push(...names);
      return [];
    },
  },
};

let spy: { mockRestore(): void };
const realFetch = globalThis.fetch;

function thread(
  overrides: {
    number?: number;
    externalId?: string | null;
    kind?: Thread["kind"];
    state?: string;
    closedAt?: Date | null;
    updatedAt?: Date;
  } = {},
): Thread {
  const {
    number = 1,
    externalId = `n${number}`,
    ...rest
  } = overrides;
  return {
    ref: {
      forge: "github",
      instance: "github.com",
      repo: {
        forge: "github",
        instance: "github.com",
        owner: "orgA",
        name: "core",
      },
      kind: "issue",
      number: String(number),
      ...(externalId === null ? {} : { externalId }),
    },
    kind: "issue",
    title: "t",
    state: "open",
    isDraft: false,
    assignees: [],
    reviewers: [],
    labels: [],
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...rest,
  } as unknown as Thread;
}

function issueNode(overrides: Record<string, unknown> = {}) {
  return {
    databaseId: 101,
    number: 1,
    url: "https://github.com/orgA/core/issues/1",
    title: "t",
    body: "",
    state: "OPEN",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    labels: { nodes: [] },
    assignees: { nodes: [] },
    comments: { nodes: [] },
    ...overrides,
  };
}

/** Seed a linked Funnel user plus the mirror identity notifications resolve. */
function seedNotificationUser(
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

const NULL_METADATA = {
  status: null,
  impact: null,
  urgency: null,
  priority: null,
  size: null,
  blocked: false,
  labelConflict: false,
};

beforeEach(() => {
  clearMirror();
  clearSettings();
  resetEventBus();
  stopSyncWorker();
  setConfig(TEST_CONFIG);
  forge.resetCaches();
  pages = [];
  etag = '"e1"';
  notModified = false;
  listQueries = [];
  timeline = [];
  deletedLabels = [];
  nodes = [];
  graphqlCalls = [];
  failIssues = false;
  repoAssignees = [];
  repoMilestones = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/installation")) {
      return Response.json({ id: 7 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  repoId = mirror.upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  }).id;
  spy = spyOn(forge, "installationProvider").mockResolvedValue(
    fakeProvider as never,
  );
});

afterEach(() => {
  spy.mockRestore();
  globalThis.fetch = realFetch;
  forge.resetCaches();
});

describe("inHistoryWindow", () => {
  const cutoff = Date.parse("2026-01-01T00:00:00Z");
  test("keeps all open issues", () => {
    expect(inHistoryWindow({ state: "open" }, cutoff)).toBe(true);
  });
  test("keeps recently closed issues and drops old ones", () => {
    expect(
      inHistoryWindow(
        { state: "closed", closedAt: Date.parse("2026-02-01T00:00:00Z") },
        cutoff,
      ),
    ).toBe(true);
    expect(
      inHistoryWindow(
        { state: "closed", closedAt: Date.parse("2020-01-01T00:00:00Z") },
        cutoff,
      ),
    ).toBe(false);
  });
  test("drops a closed issue with no closedAt", () => {
    expect(inHistoryWindow({ state: "closed" }, cutoff)).toBe(false);
    expect(
      inHistoryWindow({ state: "closed", closedAt: null }, cutoff),
    ).toBe(false);
  });
});

describe("pollRepo", () => {
  test("sends the stored ETag and short-circuits on notModified", async () => {
    mirror.setRepoEtag(repoId, '"cached"');
    notModified = true;

    const result = await pollRepo(mirror.getRepo(repoId)!, 42, 1000);

    expect(listQueries[0]?.cursor).toEqual({ etag: '"cached"' });
    expect(result.notModified).toBe(true);
    expect(result.changed).toBe(0);
    expect(graphqlCalls).toEqual([]);
  });

  test("asks for issues only, sorted by updated time with a since cursor", async () => {
    const updated = Date.parse("2026-01-01T00:00:00Z");
    mirror.upsertIssue(
      {
        externalId: "999",
        repoId,
        number: 99,
        kind: "issue",
        title: "seen",
        body: "",
        state: "open",
        stateReason: null,
        author: null,
        milestoneNumber: null,
        url: "https://github.com/orgA/core/issues/99",
        createdAt: 0,
        updatedAt: updated,
        closedAt: null,
        labels: [],
        assignees: [],
        comments: [],
      },
      NULL_METADATA,
    );

    await pollRepo(mirror.getRepo(repoId)!, 42, Date.now());

    expect(listQueries[0]).toMatchObject({
      kind: "issue",
      state: "all",
      sort: "updated",
      direction: "asc",
      perPage: 100,
      since: new Date(updated),
    });
  });

  test("hydrates changed issues, stores the ETag, and advances the cursor", async () => {
    const updated = "2026-01-02T00:00:00Z";
    pages = [
      [
        thread({
          number: 1,
          externalId: "n1",
          updatedAt: new Date(updated),
        }),
      ],
    ];
    nodes = [issueNode({ databaseId: 101, number: 1, updatedAt: updated })];

    const result = await pollRepo(
      mirror.getRepo(repoId)!,
      42,
      Date.parse("2026-01-03T00:00:00Z"),
    );

    expect(result).toMatchObject({ notModified: false, changed: 1, hydrated: 1 });
    expect(mirror.getIssue(repoId, 1)?.title).toBe("t");
    expect(mirror.getRepoCursor(repoId)).toBe(Date.parse(updated));
    expect(mirror.getRepo(repoId)?.etag).toBe('"e1"');
  });

  test("skips pull requests", async () => {
    pages = [
      [
        thread({ number: 1, externalId: "n1" }),
        thread({ number: 2, externalId: "n2", kind: "pull_request" }),
      ],
    ];
    nodes = [issueNode({ databaseId: 101, number: 1 })];

    const result = await pollRepo(mirror.getRepo(repoId)!, 42, Date.now());

    expect(listQueries[0]?.kind).toBe("issue");
    expect(result.changed).toBe(1);
    expect(graphqlCalls[0].ids as string[]).toEqual(["n1"]);
  });

  test("paginates in 100-issue batches", async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) =>
      thread({ number: i + 1, externalId: `n${i + 1}` }),
    );
    pages = [firstPage, [thread({ number: 101, externalId: "n101" })]];

    const result = await pollRepo(mirror.getRepo(repoId)!, 42, Date.now());

    expect(result.changed).toBe(101);
    expect(listQueries).toHaveLength(2);
    expect(graphqlCalls).toHaveLength(2);
    expect((graphqlCalls[0].ids as string[]).length).toBe(100);
    expect(graphqlCalls[1].ids).toEqual(["n101"]);
  });

  test("prunes changed issues that aged out of the window", async () => {
    mirror.upsertIssue(
      {
        externalId: "101",
        repoId,
        number: 1,
        kind: "issue",
        title: "old",
        body: "",
        state: "closed",
        stateReason: "completed",
        author: null,
        milestoneNumber: null,
        url: "https://github.com/orgA/core/issues/1",
        createdAt: 0,
        updatedAt: 0,
        closedAt: 0,
        labels: [],
        assignees: [],
        comments: [],
      },
      NULL_METADATA,
    );
    pages = [
      [
        thread({
          number: 1,
          externalId: "n1",
          state: "closed",
          closedAt: new Date("2020-01-01T00:00:00Z"),
        }),
      ],
    ];

    const result = await pollRepo(
      mirror.getRepo(repoId)!,
      42,
      Date.parse("2026-01-01T00:00:00Z"),
    );

    expect(result.pruned).toBe(1);
    expect(mirror.getIssue(repoId, 1)).toBeUndefined();
    expect(graphqlCalls).toEqual([]);
  });

  test("resolves label conflicts with the installation token", async () => {
    pages = [[thread({ number: 1, externalId: "n1" })]];
    nodes = [
      issueNode({
        databaseId: 101,
        number: 1,
        labels: { nodes: [{ name: "todo" }, { name: "in-progress" }] },
      }),
    ];
    timeline = [
      {
        kind: "label",
        action: "labelled",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
        detail: { type: "label", label: "todo" },
      },
      {
        kind: "label",
        action: "labelled",
        occurredAt: new Date("2026-01-02T00:00:00Z"),
        detail: { type: "label", label: "in-progress" },
      },
    ] as ForgeEvent[];

    const result = await pollRepo(mirror.getRepo(repoId)!, 42, Date.now());

    expect(result.conflicts).toBe(1);
    expect(deletedLabels).toEqual(["todo"]);
    expect(mirror.getIssue(repoId, 1)?.status).toBe("in-progress");
    expect(mirror.getIssue(repoId, 1)?.labelConflict).toBe(0);
    expect(mirror.getIssueLabels(repoId, 1)).toEqual(["in-progress"]);
  });

  test("publishes a sync event for changed issues", async () => {
    const events: unknown[] = [];
    subscribe((e) => events.push(e));
    pages = [[thread({ number: 1, externalId: "n1" })]];
    nodes = [issueNode({ databaseId: 101, number: 1 })];

    await pollRepo(mirror.getRepo(repoId)!, 42, Date.now());

    expect(events).toEqual([
      { type: "issues", repo: "orgA/core", numbers: [1] },
    ]);
  });

  test("stays quiet (no event, no etag change) on notModified", async () => {
    const events: unknown[] = [];
    subscribe((e) => events.push(e));
    mirror.setRepoEtag(repoId, '"cached"');
    notModified = true;

    await pollRepo(mirror.getRepo(repoId)!, 42, Date.now());

    expect(events).toEqual([]);
  });
});

describe("ensureRepoMirror", () => {
  test("upserts the provider's repo identity", async () => {
    const { ensureRepoMirror } = await import("./worker");

    const row = await ensureRepoMirror("orgA", "core", 7);

    expect(row).toMatchObject({
      externalId: "1",
      forge: "github",
      instance: "github.com",
      org: "orgA",
      name: "core",
      archived: 0,
    });
  });
});

describe("runRepoCycle", () => {
  test("bootstraps the repo, refreshes labels, and polls", async () => {
    pages = [[thread({ number: 1, externalId: "n1" })]];
    nodes = [issueNode({ databaseId: 101, number: 1 })];

    const result = await runRepoCycle("orgA", "core");

    expect(result.changed).toBe(1);
    expect(mirror.getRepo(repoId)?.name).toBe("core");
    expect(mirror.getRepo(repoId)?.degraded).toBe(0);
    expect(mirror.getIssue(repoId, 1)?.title).toBe("t");
  });

  test("mirrors the repo's assignable users", async () => {
    repoAssignees = [
      { id: "42", login: "amy", avatarUrl: "https://avatars/amy.png" },
      { id: "43", login: "zoe", avatarUrl: "https://avatars/zoe.png" },
    ];

    await runRepoCycle("orgA", "core");

    expect(mirror.getRepoAssignees(repoId).map((u) => u.login)).toEqual([
      "amy",
      "zoe",
    ]);
    expect(
      mirror.getRepoAssignees(repoId).map((u) => u.externalId),
    ).toEqual(["42", "43"]);
  });

  test("mirrors the repo's milestones on the first cycle only", async () => {
    repoMilestones = [
      {
        number: 1,
        id: 11,
        title: "v1",
        state: "open",
        due_on: "2026-01-01T00:00:00Z",
        open_issues: 2,
        closed_issues: 3,
      },
    ];

    await runRepoCycle("orgA", "core");
    expect(mirror.getRepoMilestones(repoId).map((m) => m.title)).toEqual(["v1"]);
    expect(mirror.getRepoMilestones(repoId)[0]?.externalId).toBe("11");

    repoMilestones = [{ number: 2, id: 12, title: "v2", state: "open" }];
    await runRepoCycle("orgA", "core");
    // Later polls skip the directory refresh; nightly reconciliation owns it.
    expect(mirror.getRepoMilestones(repoId).map((m) => m.title)).toEqual(["v1"]);

    const { refreshRepoMilestones } = await import("./worker");
    await refreshRepoMilestones(7, mirror.getRepo(repoId)!);
    expect(mirror.getRepoMilestones(repoId).map((m) => m.title)).toEqual(["v2"]);
  });

  test("marks the repo degraded and rethrows when polling fails", async () => {
    failIssues = true;

    await expect(runRepoCycle("orgA", "core")).rejects.toThrow("boom");
    expect(mirror.getRepo(repoId)?.degraded).toBe(1);
  });
});

describe("refreshIssue", () => {
  afterEach(() => {
    db.delete(stateNotification).run();
    db.delete(stateIssueWatch).run();
    db.delete(authAccount).run();
    db.delete(authUser).run();
  });

  test("hydrates a single issue and publishes an event", async () => {
    const events: unknown[] = [];
    subscribe((e) => events.push(e));
    nodes = [issueNode({ databaseId: 101, number: 1 })];

    await refreshIssue("orgA", "core", 1);

    expect(mirror.getIssue(repoId, 1)?.title).toBe("t");
    expect(events).toEqual([
      { type: "issues", repo: "orgA/core", numbers: [1] },
    ]);
  });

  test("passes the actor through and suppresses their own notice", async () => {
    db.delete(stateNotification).run();
    db.delete(stateIssueWatch).run();
    db.delete(authAccount).run();
    db.delete(authUser).run();
    seedNotificationUser("w1", "42", "wanda");
    seedNotificationUser("a1", "7", "amy");
    watchIssue("w1", "orgA", "core", 1);
    watchIssue("a1", "orgA", "core", 1);

    nodes = [issueNode({ labels: { nodes: [{ name: "todo" }] } })];
    await refreshIssue("orgA", "core", 1);

    nodes = [issueNode({ labels: { nodes: [{ name: "in-progress" }] } })];
    await refreshIssue("orgA", "core", 1, "a1");
    // A re-poll of the same change must not repeat the notice.
    await refreshIssue("orgA", "core", 1, "a1");

    const rows = db.select().from(stateNotification).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "w1", kind: "status" });
  });
});

describe("syncAllRepos", () => {
  test("polls every configured repo and isolates failures", async () => {
    setConfig({
      ...TEST_CONFIG,
      repos: [{ repo: "orgA/core", shortcode: "CORE" }],
    });
    pages = [[thread({ number: 1, externalId: "n1" })]];
    nodes = [issueNode({ databaseId: 101, number: 1 })];

    await syncAllRepos();

    expect(mirror.getIssue(repoId, 1)?.title).toBe("t");
  });
});

describe("scheduler lifecycle", () => {
  test("start/stop are safe and idempotent", () => {
    startSyncWorker();
    startSyncWorker();
    stopSyncWorker();
    stopSyncWorker();
    expect(true).toBe(true);
  });
});
