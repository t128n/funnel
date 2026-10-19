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
  allIssues,
  attentionIssues,
  filterContext,
  getIssueListItem,
  getMilestone,
  inbox,
  listMilestones,
  milestoneIssues,
  myIssues,
  statusBoard,
} from "./queries";

const DAY_MS = 86_400_000;
const VIEWER = 42;

function user(githubId: number, login: string): UserRecord {
  return { githubId, login, avatarUrl: `https://avatars/${login}.png` };
}

function seed(): void {
  upsertRepo({ githubId: 1, org: "orgA", name: "core", archived: false });
  upsertRepo({ githubId: 2, org: "orgA", name: "web", archived: false });

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
      githubId: 101,
      repoId: 1,
      number: 1,
      title: "Alpha crash",
      body: "stack trace",
      author: user(7, "octocat"),
      updatedAt: 100,
      closedAt: null,
      labels: ["todo", "p1", "sm", "bug"],
      assignees: [user(VIEWER, "me")],
      comments: [
        { githubId: 1001, author: user(7, "octocat"), body: "repro steps", createdAt: 11, updatedAt: 11 },
      ],
    },
    { status: "todo", impact: 1, urgency: 1, priority: "P1", size: "sm", blocked: false, labelConflict: false },
  );

  upsertIssue(
    {
      ...base,
      githubId: 102,
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
      githubId: 103,
      repoId: 2,
      number: 3,
      title: "Gamma regression",
      author: user(8, "alice"),
      updatedAt: 300,
      closedAt: null,
      labels: ["in-progress", "p2", "frontend"],
      assignees: [user(7, "octocat")],
    },
    { status: "in-progress", impact: 2, urgency: 2, priority: "P2", size: null, blocked: false, labelConflict: false },
  );

  upsertIssue(
    {
      ...base,
      githubId: 104,
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
      githubId: 105,
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
      githubId: 106,
      repoId: 1,
      number: 6,
      title: "Zeta polish",
      author: null,
      updatedAt: 50,
      closedAt: null,
      labels: ["backlog", "p3", "lg", "bug"],
      assignees: [user(7, "octocat"), user(8, "alice")],
    },
    { status: "backlog", impact: 3, urgency: 3, priority: "P3", size: "lg", blocked: false, labelConflict: false },
  );
}

function parse(query: string) {
  return parseIssueFilter(new URLSearchParams(query), filterContext(VIEWER));
}

const numbers = (items: { number: number }[]) => items.map((item) => item.number);

beforeEach(() => {
  db.delete(stateIntakeSubmission).run();
  clearMirror();
  setConfig(TEST_CONFIG);
  seed();
});

describe("allIssues", () => {
  test("sorts by derived priority then updated", () => {
    expect(numbers(allIssues(parse("")))).toEqual([1, 3, 6]);
  });

  test("excludes untriaged issues (they belong to the Inbox)", () => {
    const untriaged = allIssues(parse("status=none"));
    expect(untriaged).toEqual([]);
  });

  test("hydrates repo, labels, assignees, and author", () => {
    const [first] = allIssues(parse(""));
    expect(first.repo).toBe("orgA/core");
    expect(first.number).toBe(1);
    expect(first.labels.sort()).toEqual(["bug", "p1", "sm", "todo"]);
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

  test("uses the derived priority for filtering, sorting and none", () => {
    expect(numbers(allIssues(parse("priority=p1")))).toEqual([1]);
    expect(numbers(allIssues(parse("")))).toEqual([1, 3, 6]);
    expect(numbers(allIssues(parse("priority=none")))).toEqual([]);
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
    expect(myIssues(parse(""), null)).toEqual([]);
  });
});

describe("inbox", () => {
  test("lists pending submissions then untriaged issues", () => {
    const { id } = createSubmission({ title: "Inbound request", body: "please" });
    const { entries } = inbox(parse(""));
    expect(entries[0]).toMatchObject({
      kind: "submission",
      submission: { id, title: "Inbound request" },
    });
    const issueEntries = entries.filter((entry) => entry.kind === "issue");
    expect(issueEntries.map((entry) => (entry as { issue: { number: number } }).issue.number)).toEqual([2]);
  });

  test("search matches submissions and untriaged issues", () => {
    createSubmission({ title: "Inbound request", body: "please" });
    expect(inbox(parse("q=inbound")).entries).toHaveLength(1);
    expect(inbox(parse("q=beta")).entries).toHaveLength(1);
  });

  test("a status filter excludes untriaged issues", () => {
    expect(inbox(parse("status=todo")).entries).toHaveLength(0);
  });
});

describe("statusBoard", () => {
  test("partitions the four statuses plus a Done window", async () => {
    const board = await statusBoard(parse(""));
    const byKey = Object.fromEntries(
      board.columns.map((column) => [column.key, numbers(column.issues)]),
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
      board.columns.map((column) => [column.key, numbers(column.issues)]),
    );
    expect(byKey["in-progress"]).toEqual([3]);
    expect(byKey.todo).toEqual([]);
    expect(byKey.done).toEqual([4]);
  });
});

describe("attentionIssues", () => {
  function seedBlockedIssue(
    number: number,
    githubId: number,
    body: string,
    blocked: boolean,
  ): void {
    upsertIssue(
      {
        githubId,
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
    seedBlockedIssue(7, 107, withRecheck("2026-10-25"), true);
    // Blocked but no metadata date.
    seedBlockedIssue(8, 108, "plain body", true);
    // Has a date in the body but is not flagged blocked.
    seedBlockedIssue(9, 109, withRecheck("2026-10-20"), false);

    const items = attentionIssues();
    expect(items.map((item) => item.issue.number)).toEqual([7]);
    expect(items[0].blocker).toBe("Upstream API key");
    expect(items[0].recheck).toBe("2026-10-25");
  });

  test("sorts by re-check date", () => {
    seedBlockedIssue(7, 107, withRecheck("2026-11-01"), true);
    seedBlockedIssue(8, 108, withRecheck("2026-10-19"), true);
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
        githubId: 10,
        title: "v1",
        description: "First release",
        state: "open",
        dueOn: 1_000,
        openIssues: 1,
        closedIssues: 0,
        creator: user(7, "octocat"),
        createdAt: 1,
        updatedAt: 2,
        closedAt: null,
        htmlUrl: "https://github.com/orgA/core/milestone/1",
      },
    ]);
    upsertIssue(
      {
        githubId: 101,
        repoId: 1,
        number: 1,
        title: "Alpha crash",
        body: "stack trace",
        state: "open",
        stateReason: null,
        author: user(7, "octocat"),
        milestoneNumber: 1,
        createdAt: 1,
        updatedAt: 100,
        closedAt: null,
        labels: ["todo", "p1", "sm", "bug"],
        assignees: [user(VIEWER, "me")],
        comments: [],
      },
      { status: "todo", impact: 1, urgency: 1, priority: "P1", size: "sm", blocked: false, labelConflict: false },
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
    expect(numbers(milestoneIssues(1, 1))).toEqual([1]);
    expect(numbers(allIssues(parse("milestone=orgA/core#1")))).toEqual([1]);
    expect(numbers(allIssues(parse("milestone=none")))).toEqual([3, 6]);
  });
});
