import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { stateIntakeSubmission } from "#lib/server/db/schema";
import { createSubmission } from "#lib/server/intake/staging";
import {
  replaceRepoMilestones,
  upsertIssue,
  upsertRepo,
  type UserRecord,
} from "#lib/server/sync/mirror";
import { writeBlocked } from "#lib/funnel-metadata";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { parseIssueFilter } from "./filters";
import {
  decodeCursor,
  encodeCursor,
  filterSignature,
  type CursorKey,
  type ListPage,
} from "./pagination";
import {
  allIssues,
  attentionIssues,
  boardColumnPage,
  filterContext,
  getIssueListItem,
  getMilestone,
  inbox,
  inboxCount,
  listMilestones,
  milestoneIssues,
  myIssues,
  statusBoard,
} from "./queries";

const DAY_MS = 86_400_000;
const VIEWER = "42";

function user(externalId: string, login: string): UserRecord {
  return {
    id: 0,
    externalId,
    forge: "github",
    instance: "github.com",
    login,
    avatarUrl: `https://avatars/${login}.png`,
    url: "",
  };
}

function seed(): void {
  upsertRepo({ externalId: "1", forge: "github", instance: "github.com", org: "orgA", name: "core", url: "https://github.com/orgA/core", archived: false });
  upsertRepo({ externalId: "2", forge: "github", instance: "github.com", org: "orgA", name: "web", url: "https://github.com/orgA/web", archived: false });

  const base = {
    state: "open" as const,
    stateReason: null,
    milestoneNumber: null,
    createdAt: 1,
    assignees: [],
    comments: [],
    body: "",
  };

  upsertIssue(
    {
      ...base,
      externalId: "101",
      kind: "issue",
      url: "",
      repoId: 1,
      number: 1,
      title: "Alpha crash",
      body: "stack trace",
      author: user("7", "octocat"),
      updatedAt: 100,
      closedAt: null,
      labels: ["todo", "sev", "sm", "bug"],
      assignees: [user(VIEWER, "me")],
      comments: [
        { externalId: "1001", author: user("7", "octocat"), body: "repro steps", createdAt: 11, updatedAt: 11 },
      ],
    },
    { status: "todo", impact: null, urgency: null, priority: "P1", size: "sm", blocked: false, labelConflict: false },
  );

  upsertIssue(
    {
      ...base,
      externalId: "102",
      kind: "issue",
      url: "",
      repoId: 1,
      number: 2,
      title: "Beta feature",
      author: null,
      updatedAt: 200,
      closedAt: null,
      labels: [],
    },
    { status: null, impact: null, urgency: null, priority: null, size: null, blocked: false, labelConflict: false },
  );

  upsertIssue(
    {
      ...base,
      externalId: "103",
      kind: "issue",
      url: "",
      repoId: 2,
      number: 3,
      title: "Gamma regression",
      author: user("8", "alice"),
      updatedAt: 300,
      closedAt: null,
      labels: ["in-progress", "mod", "frontend"],
      assignees: [user("7", "octocat")],
    },
    { status: "in-progress", impact: null, urgency: null, priority: "P2", size: null, blocked: false, labelConflict: false },
  );

  upsertIssue(
    {
      ...base,
      externalId: "104",
      kind: "issue",
      url: "",
      repoId: 2,
      number: 4,
      title: "Delta done",
      state: "closed",
      stateReason: "completed",
      author: null,
      updatedAt: 400,
      closedAt: Date.now() - DAY_MS,
      labels: ["lg"],
    },
    { status: null, impact: null, urgency: null, priority: null, size: "lg", blocked: false, labelConflict: false },
  );

  upsertIssue(
    {
      ...base,
      externalId: "105",
      kind: "issue",
      url: "",
      repoId: 1,
      number: 5,
      title: "Epsilon canceled",
      state: "closed",
      stateReason: "not_planned",
      author: null,
      updatedAt: 500,
      closedAt: Date.now() - 2 * DAY_MS,
      labels: [],
    },
    { status: null, impact: null, urgency: null, priority: null, size: null, blocked: false, labelConflict: false },
  );

  upsertIssue(
    {
      ...base,
      externalId: "106",
      kind: "issue",
      url: "",
      repoId: 1,
      number: 6,
      title: "Zeta polish",
      author: null,
      updatedAt: 50,
      closedAt: null,
      labels: ["backlog", "min", "lg", "bug"],
      assignees: [user("7", "octocat"), user("8", "alice")],
    },
    { status: "backlog", impact: null, urgency: null, priority: "P3", size: "lg", blocked: false, labelConflict: false },
  );
}

function parse(query: string) {
  return parseIssueFilter(new URLSearchParams(query), filterContext(VIEWER));
}

function seedExtra(input: {
  repoId: number;
  number: number;
  externalId: string;
  title?: string;
  state?: "open" | "closed";
  stateReason?: string | null;
  updatedAt: number;
  closedAt?: number | null;
  status: string | null;
  priority: "P1" | "P2" | "P3" | null;
}): void {
  upsertIssue(
    {
      externalId: input.externalId,
      kind: "issue",
      url: "",
      repoId: input.repoId,
      number: input.number,
      title: input.title ?? `Issue ${input.number}`,
      body: "",
      state: input.state ?? "open",
      stateReason: input.stateReason ?? null,
      author: null,
      milestoneNumber: null,
      createdAt: 1,
      updatedAt: input.updatedAt,
      closedAt: input.closedAt ?? null,
      labels: [],
      assignees: [],
      comments: [],
    },
    {
      status: input.status,
      impact: null,
      urgency: null,
      priority: input.priority,
      size: null,
      blocked: false,
      labelConflict: false,
    },
  );
}

const numbers = (page: ListPage<{ number: number }>) =>
  page.items.map((item) => item.number);
const rawNumbers = (items: { number: number }[]) =>
  items.map((item) => item.number);

beforeEach(() => {
  db.delete(stateIntakeSubmission).run();
  clearMirror();
  setConfig(TEST_CONFIG);
  seed();
});

describe("allIssues", () => {
  test("sorts priority (p1 first, unprioritized last) then updated", () => {
    expect(numbers(allIssues(parse("")))).toEqual([1, 3, 6]);
  });

  test("excludes untriaged issues (they belong to the Inbox)", () => {
    const untriaged = allIssues(parse("status=none"));
    expect(untriaged.items).toEqual([]);
  });

  test("hydrates repo, labels, assignees, and author", () => {
    const [first] = allIssues(parse("")).items;
    expect(first.repo).toBe("orgA/core");
    expect(first.number).toBe(1);
    expect(first.labels.sort()).toEqual(["bug", "sev", "sm", "todo"]);
    expect(first.assignees.map((a) => a.login)).toEqual(["me"]);
    expect(first.author?.login).toBe("octocat");
    expect(first.author?.avatarUrl).toBe("https://avatars/octocat.png");
  });

  test("applies the repo dimension", () => {
    expect(numbers(allIssues(parse("repo=orgA/web")))).toEqual([3]);
  });

  test("applies the state dimension incl. both", () => {
    expect(numbers(allIssues(parse("state=open")))).toEqual([1, 3, 6]);
    expect(numbers(allIssues(parse("state=closed")))).toEqual([]);
    expect(numbers(allIssues(parse("state=open,closed")))).toEqual([
      1, 3, 6,
    ]);
  });

  test("applies the status dimension incl. none", () => {
    expect(numbers(allIssues(parse("status=todo")))).toEqual([1]);
    expect(numbers(allIssues(parse("status=none")))).toEqual([]);
    expect(numbers(allIssues(parse("status=backlog")))).toEqual([6]);
  });

  test("applies priority and size dimensions", () => {
    expect(numbers(allIssues(parse("priority=p1")))).toEqual([1]);
    expect(numbers(allIssues(parse("size=lg")))).toEqual([6]);
  });

  test("applies the non-reserved label dimension", () => {
    expect(numbers(allIssues(parse("label=bug")))).toEqual([1, 6]);
    expect(numbers(allIssues(parse("label=frontend")))).toEqual([3]);
  });

  test("applies the assignee dimension (me, login, numeric)", () => {
    expect(numbers(allIssues(parse("assignee=me")))).toEqual([1]);
    expect(numbers(allIssues(parse("assignee=octocat")))).toEqual([3, 6]);
    expect(numbers(allIssues(parse("assignee=8")))).toEqual([6]);
  });

  test("combines dimensions with AND", () => {
    expect(numbers(allIssues(parse("repo=orgA/core&priority=p3&label=bug")))).toEqual([
      6,
    ]);
    expect(
      numbers(allIssues(parse("repo=orgA/core&priority=p3&label=frontend"))),
    ).toEqual([]);
  });

  test("searches titles, bodies, and comments with LIKE", () => {
    expect(numbers(allIssues(parse("q=gamma")))).toEqual([3]);
    expect(numbers(allIssues(parse("q=repro")))).toEqual([1]);
    expect(numbers(allIssues(parse("q=stack")))).toEqual([1]);
    expect(numbers(allIssues(parse("q=nomatch")))).toEqual([]);
  });

  test("treats LIKE metacharacters literally", () => {
    expect(numbers(allIssues(parse("q=%")))).toEqual([]);
  });
});

describe("myIssues", () => {
  test("restricts to the viewer's assignments", () => {
    expect(numbers(myIssues(parse(""), VIEWER))).toEqual([1]);
  });

  test("still applies the other dimensions", () => {
    expect(numbers(myIssues(parse("repo=orgA/web"), VIEWER))).toEqual([]);
  });

  test("is empty without a viewer id", () => {
    expect(myIssues(parse(""), null).items).toEqual([]);
  });
});

describe("inbox", () => {
  test("lists pending submissions then untriaged issues", () => {
    const { id } = createSubmission({ title: "Inbound request", body: "please" });
    const { items } = inbox(parse(""));
    expect(items[0]).toMatchObject({
      kind: "submission",
      submission: { id, title: "Inbound request" },
    });
    const issueEntries = items.filter((entry) => entry.kind === "issue");
    expect(issueEntries.map((entry) => (entry as { issue: { number: number } }).issue.number)).toEqual([2]);
  });

  test("search matches submissions and untriaged issues", () => {
    createSubmission({ title: "Inbound request", body: "please" });
    expect(inbox(parse("q=inbound")).items).toHaveLength(1);
    expect(inbox(parse("q=beta")).items).toHaveLength(1);
  });

  test("a status filter excludes untriaged issues", () => {
    expect(inbox(parse("status=todo")).items).toHaveLength(0);
  });
});

describe("statusBoard", () => {
  test("partitions the four statuses plus a Done window", async () => {
    const board = await statusBoard(parse(""));
    const byKey = Object.fromEntries(
      board.columns.map((column) => [column.key, rawNumbers(column.issues)]),
    );
    expect(byKey).toEqual({
      backlog: [6],
      todo: [1],
      "in-progress": [3],
      "in-review": [],
      done: [4],
    });
  });

  test("canceled issues are omitted and the Done window is bounded", async () => {
    const board = await statusBoard(parse(""));
    const done = board.columns.find((column) => column.key === "done");
    expect(done?.issues.map((issue) => issue.number)).toEqual([4]);
  });

  test("applies non-status dimensions to every column", async () => {
    const board = await statusBoard(parse("repo=orgA/web"));
    const byKey = Object.fromEntries(
      board.columns.map((column) => [column.key, rawNumbers(column.issues)]),
    );
    expect(byKey["in-progress"]).toEqual([3]);
    expect(byKey.todo).toEqual([]);
    expect(byKey.done).toEqual([4]);
  });
});

describe("attentionIssues", () => {
  function seedBlockedIssue(
    number: number,
    externalId: string,
    body: string,
    blocked: boolean,
  ): void {
    upsertIssue(
      {
        externalId,
        kind: "issue",
        url: "",
        repoId: 1,
        number,
        title: `Blocked ${number}`,
        body,
        state: "open",
        stateReason: null,
        author: null,
        milestoneNumber: null,
        createdAt: 1,
        updatedAt: 600,
        closedAt: null,
        labels: ["in-progress", "blocked"],
        assignees: [],
        comments: [],
      },
      { status: "in-progress", impact: null, urgency: null, priority: null, size: null, blocked, labelConflict: false },
    );
  }

  const withRecheck = (recheck: string) =>
    writeBlocked("desc", { blocker: "Upstream API key", needs: "Token", trying: "", recheck });

  test("returns only blocked issues that carry a re-check date", () => {
    seedBlockedIssue(7, "107", withRecheck("2026-10-25"), true);
    // Blocked but no metadata date.
    seedBlockedIssue(8, "108", "plain body", true);
    // Has a date in the body but is not flagged blocked.
    seedBlockedIssue(9, "109", withRecheck("2026-10-20"), false);

    const items = attentionIssues();
    expect(items.map((item) => item.issue.number)).toEqual([7]);
    expect(items[0].blocker).toBe("Upstream API key");
    expect(items[0].recheck).toBe("2026-10-25");
  });

  test("sorts by re-check date", () => {
    seedBlockedIssue(7, "107", withRecheck("2026-11-01"), true);
    seedBlockedIssue(8, "108", withRecheck("2026-10-19"), true);
    expect(attentionIssues().map((item) => item.recheck)).toEqual([
      "2026-10-19",
      "2026-11-01",
    ]);
  });
});

describe("getIssueListItem", () => {
  test("returns one hydrated row", () => {
    expect(getIssueListItem(1, 1)?.title).toBe("Alpha crash");
    expect(getIssueListItem(1, 999)).toBeUndefined();
  });
});

describe("milestones", () => {
  function seedMilestone(): void {
    replaceRepoMilestones(1, [
      {
        number: 1,
        externalId: "10",
        title: "v1",
        description: "First release",
        state: "open",
        dueOn: 1_000,
        openIssues: 1,
        closedIssues: 0,
        creator: user("7", "octocat"),
        createdAt: 1,
        updatedAt: 2,
        closedAt: null,
        url: "https://github.com/orgA/core/milestone/1",
      },
    ]);
    upsertIssue(
      {
        externalId: "101",
        kind: "issue",
        url: "",
        repoId: 1,
        number: 1,
        title: "Alpha crash",
        body: "stack trace",
        state: "open",
        stateReason: null,
        author: user("7", "octocat"),
        milestoneNumber: 1,
        createdAt: 1,
        updatedAt: 100,
        closedAt: null,
        labels: ["todo", "sev", "sm", "bug"],
        assignees: [user(VIEWER, "me")],
        comments: [],
      },
      { status: "todo", impact: null, urgency: null, priority: "P1", size: "sm", blocked: false, labelConflict: false },
    );
  }

  test("hydrates the issue's milestone and exposes it in filter options", () => {
    seedMilestone();
    const issue = getIssueListItem(1, 1);
    expect(issue?.milestone).toEqual({
      repo: "orgA/core",
      number: 1,
      title: "v1",
      state: "open",
      dueOn: 1_000,
    });
  });

  test("lists milestones with progress and resolves one by number", () => {
    seedMilestone();
    const [milestone] = listMilestones(1);
    expect(milestone).toMatchObject({ repo: "orgA/core", number: 1, progress: 0 });
    expect(getMilestone(1, 1)?.title).toBe("v1");
    expect(getMilestone(1, 99)).toBeUndefined();
  });

  test("returns the milestone's issues and filters by milestone", () => {
    seedMilestone();
    expect(rawNumbers(milestoneIssues(1, 1))).toEqual([1]);
    expect(numbers(allIssues(parse("milestone=orgA/core#1")))).toEqual([1]);
    expect(numbers(allIssues(parse("milestone=none")))).toEqual([3, 6]);
  });
});

describe("cursor pagination", () => {
  test("round-trips a cursor and rejects malformed payloads", () => {
    const signature = filterSignature(parse(""));
    const key: CursorKey = [0, 100, 1, 1];
    const cursor = encodeCursor(signature, [...key]);
    expect(decodeCursor(cursor, signature)).toEqual(key);

    expect(decodeCursor(cursor, filterSignature(parse("repo=orgA/web")))).toBeNull();
    expect(decodeCursor("not-base64!!", signature)).toBeNull();
    expect(
      decodeCursor(
        Buffer.from(JSON.stringify({ v: 2, f: signature, k: key })).toString("base64url"),
        signature,
      ),
    ).toBeNull();
    expect(
      decodeCursor(
        Buffer.from(JSON.stringify({ v: 1, f: signature, k: [0, 100, 1] })).toString("base64url"),
        signature,
      ),
    ).toBeNull();
  });

  test("a filter signature ignores dimension order but tracks values", () => {
    const a = filterSignature(parse("repo=orgA/core&repo=orgA/web&priority=p1,p2"));
    const b = filterSignature(parse("priority=p2,p1&repo=orgA/web&repo=orgA/core"));
    expect(a).toBe(b);
    expect(a).not.toBe(filterSignature(parse("repo=orgA/core")));
    expect(filterSignature(parse(""), "inbox")).not.toBe(
      filterSignature(parse("")),
    );
  });

  test("a cursor from another filter is rejected", () => {
    const webCursor = encodeCursor(filterSignature(parse("repo=orgA/web")), [
      1, 300, 2, 3,
    ]);
    const empty = allIssues(parse(""), { cursor: webCursor });
    expect(numbers(empty)).toEqual([1, 3, 6]);
    expect(empty.nextCursor).toBeNull();
  });

  test("allIssues walks pages without gaps or duplicates", () => {
    const all = allIssues(parse(""));
    expect(numbers(all)).toEqual([1, 3, 6]);
    expect(all.total).toBe(3);
    expect(all.nextCursor).toBeNull();

    const first = allIssues(parse(""), { limit: 2 });
    expect(numbers(first)).toEqual([1, 3]);
    expect(first.total).toBe(3);
    expect(first.nextCursor).not.toBeNull();

    const second = allIssues(parse(""), {
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(numbers(second)).toEqual([6]);
    expect(second.total).toBe(3);
    expect(second.nextCursor).toBeNull();

    const walked: number[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = allIssues(parse(""), { limit: 1, cursor });
      walked.push(...numbers(page));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(walked).toEqual([1, 3, 6]);
  });

  test("the last full page has no cursor when nothing follows", () => {
    const page = allIssues(parse(""), { limit: 3 });
    expect(numbers(page)).toEqual([1, 3, 6]);
    expect(page.nextCursor).toBeNull();
  });

  test("ties break by repoId DESC then number DESC", () => {
    seedExtra({
      repoId: 1,
      number: 7,
      externalId: "107",
      updatedAt: 300,
      status: "todo",
      priority: "P2",
    });
    seedExtra({
      repoId: 2,
      number: 8,
      externalId: "108",
      updatedAt: 300,
      status: "in-progress",
      priority: "P2",
    });

    const page = allIssues(parse("priority=p2"));
    expect(numbers(page)).toEqual([8, 3, 7]);
    expect(page.total).toBe(3);

    const first = allIssues(parse("priority=p2"), { limit: 1 });
    const second = allIssues(parse("priority=p2"), {
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(numbers(first)).toEqual([8]);
    expect(numbers(second)).toEqual([3]);
  });

  test("myIssues pages the viewer's assignments", () => {
    const page = myIssues(parse(""), VIEWER, { limit: 1 });
    expect(numbers(page)).toEqual([1]);
    expect(page.total).toBe(1);
    expect(page.nextCursor).toBeNull();
    expect(myIssues(parse(""), null).total).toBe(0);
  });
});

describe("inbox pagination", () => {
  test("pages the issue half while submissions stay first", () => {
    createSubmission({ title: "One", body: "first" });
    createSubmission({ title: "Two", body: "second" });
    seedExtra({
      repoId: 1,
      number: 7,
      externalId: "107",
      updatedAt: 10,
      status: null,
      priority: null,
    });
    seedExtra({
      repoId: 1,
      number: 8,
      externalId: "108",
      updatedAt: 20,
      status: null,
      priority: null,
    });

    const first = inbox(parse(""), { limit: 2 });
    const submissions = first.items.filter((entry) => entry.kind === "submission");
    const issues = first.items.filter((entry) => entry.kind === "issue");
    expect(submissions).toHaveLength(2);
    expect(
      issues.map((entry) => (entry as { issue: { number: number } }).issue.number),
    ).toEqual([2, 8]);
    expect(first.total).toBe(5);
    expect(first.nextCursor).not.toBeNull();

    const second = inbox(parse(""), { limit: 2, cursor: first.nextCursor });
    expect(second.items.filter((entry) => entry.kind === "submission")).toHaveLength(2);
    expect(
      second.items
        .filter((entry) => entry.kind === "issue")
        .map((entry) => (entry as { issue: { number: number } }).issue.number),
    ).toEqual([7]);
    expect(second.total).toBe(5);
    expect(second.nextCursor).toBeNull();
  });

  test("inboxCount counts submissions and untriaged issues", () => {
    createSubmission({ title: "Inbound request", body: "please" });
    expect(inboxCount(parse(""))).toBe(inbox(parse("")).total);
    expect(inboxCount(parse(""))).toBe(2);
    expect(inboxCount(parse("q=inbound"))).toBe(1);
    expect(inboxCount(parse("q=beta"))).toBe(1);
    // Submissions always count; only the untriaged issue half is filtered.
    expect(inboxCount(parse("status=todo"))).toBe(1);
    expect(inboxCount(parse("status=todo"))).toBe(
      inbox(parse("status=todo")).total,
    );
  });
});

describe("board pagination", () => {
  test("columns carry server totals and cursors", async () => {
    const board = await statusBoard(parse(""));
    const byKey = Object.fromEntries(
      board.columns.map((column) => [
        column.key,
        {
          total: column.total,
          nextCursor: column.nextCursor,
          numbers: rawNumbers(column.issues),
        },
      ]),
    );
    expect(byKey).toEqual({
      backlog: { total: 1, nextCursor: null, numbers: [6] },
      todo: { total: 1, nextCursor: null, numbers: [1] },
      "in-progress": { total: 1, nextCursor: null, numbers: [3] },
      "in-review": { total: 0, nextCursor: null, numbers: [] },
      done: { total: 1, nextCursor: null, numbers: [4] },
    });
  });

  test("boardColumnPage pages a single lane", async () => {
    seedExtra({
      repoId: 1,
      number: 7,
      externalId: "107",
      updatedAt: 10,
      status: "in-progress",
      priority: null,
    });
    seedExtra({
      repoId: 1,
      number: 8,
      externalId: "108",
      updatedAt: 20,
      status: "in-progress",
      priority: null,
    });

    const first = await boardColumnPage(parse(""), "in-progress", { limit: 2 });
    expect(numbers(first)).toEqual([3, 8]);
    expect(first.total).toBe(3);
    expect(first.nextCursor).not.toBeNull();

    const second = await boardColumnPage(parse(""), "in-progress", {
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(numbers(second)).toEqual([7]);
    expect(second.total).toBe(3);
    expect(second.nextCursor).toBeNull();
  });

  test("a lane cursor is scoped to its column", async () => {
    seedExtra({
      repoId: 1,
      number: 7,
      externalId: "107",
      updatedAt: 10,
      status: "in-progress",
      priority: null,
    });

    const inProgress = await boardColumnPage(parse(""), "in-progress", {
      limit: 1,
    });
    expect(inProgress.nextCursor).not.toBeNull();

    const todo = await boardColumnPage(parse(""), "todo", {
      limit: 1,
      cursor: inProgress.nextCursor,
    });
    expect(numbers(todo)).toEqual([1]);
  });

  test("board ignores the status dimension and keeps Done bounded", async () => {
    const page = await boardColumnPage(parse("status=todo"), "in-progress", {
      limit: 50,
    });
    expect(numbers(page)).toEqual([3]);
    expect(page.total).toBe(1);

    const done = await boardColumnPage(parse(""), "done", { limit: 50 });
    expect(numbers(done)).toEqual([4]);
    expect(done.total).toBe(1);

    seedExtra({
      repoId: 1,
      number: 9,
      externalId: "109",
      updatedAt: 900,
      state: "closed",
      stateReason: "not_planned",
      closedAt: Date.now() - 2 * DAY_MS,
      status: null,
      priority: null,
    });
    const stillDone = await boardColumnPage(parse(""), "done", { limit: 50 });
    expect(numbers(stillDone)).toEqual([4]);
    expect(stillDone.total).toBe(1);
  });
});
