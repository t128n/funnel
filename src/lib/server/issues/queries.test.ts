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
import type { UserRef } from "./types";
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
const VIEWER = "42";
const FORGE = "github";
const INSTANCE = "github.com";

/** The internal repo ids assigned by the mirror on seed. */
let coreId = 0;
let webId = 0;

function user(externalId: string, login: string): UserRecord {
  return {
    id: 0,
    externalId,
    forge: FORGE,
    instance: INSTANCE,
    login,
    avatarUrl: `https://avatars/${login}.png`,
    url: `https://github.com/${login}`,
  };
}

function repo(externalId: string, org: string, name: string): number {
  return upsertRepo({
    externalId,
    forge: FORGE,
    instance: INSTANCE,
    org,
    name,
    url: `https://github.com/${org}/${name}`,
    archived: false,
  }).id;
}

function issueUrl(slug: string, number: number): string {
  return `https://github.com/${slug}/issues/${number}`;
}

function seed(): void {
  coreId = repo("1", "orgA", "core");
  webId = repo("2", "orgA", "web");

  const base = {
    kind: "issue" as const,
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
      repoId: coreId,
      number: 1,
      title: "Alpha crash",
      body: "stack trace",
      author: user("7", "octocat"),
      url: issueUrl("orgA/core", 1),
      updatedAt: 100,
      closedAt: null,
      labels: ["todo", "p1", "sm", "bug"],
      assignees: [user(VIEWER, "me")],
      comments: [
        {
          externalId: "1001",
          author: user("7", "octocat"),
          body: "repro steps",
          createdAt: 11,
          updatedAt: 11,
        },
      ],
    },
    { status: "todo", impact: 1, urgency: 1, priority: "P1", size: "sm", blocked: false, labelConflict: false },
  );

  upsertIssue(
    {
      ...base,
      externalId: "102",
      repoId: coreId,
      number: 2,
      title: "Beta feature",
      author: null,
      url: issueUrl("orgA/core", 2),
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
      repoId: webId,
      number: 3,
      title: "Gamma regression",
      author: user("8", "alice"),
      url: issueUrl("orgA/web", 3),
      updatedAt: 300,
      closedAt: null,
      labels: ["in-progress", "p2", "frontend"],
      assignees: [user("7", "octocat")],
    },
    { status: "in-progress", impact: 2, urgency: 2, priority: "P2", size: null, blocked: false, labelConflict: false },
  );

  upsertIssue(
    {
      ...base,
      externalId: "104",
      repoId: webId,
      number: 4,
      title: "Delta done",
      state: "closed",
      stateReason: "completed",
      author: null,
      url: issueUrl("orgA/web", 4),
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
      repoId: coreId,
      number: 5,
      title: "Epsilon canceled",
      state: "closed",
      stateReason: "not_planned",
      author: null,
      url: issueUrl("orgA/core", 5),
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
      repoId: coreId,
      number: 6,
      title: "Zeta polish",
      author: null,
      url: issueUrl("orgA/core", 6),
      updatedAt: 50,
      closedAt: null,
      labels: ["backlog", "p3", "lg", "bug"],
      assignees: [user("7", "octocat"), user("8", "alice")],
    },
    { status: "backlog", impact: 3, urgency: 3, priority: "P3", size: "lg", blocked: false, labelConflict: false },
  );
}

function parse(query: string) {
  return parseIssueFilter(new URLSearchParams(query), filterContext(VIEWER));
}

test("UserRef carries an external identity", () => {
  const user: UserRef = {
    externalId: "101",
    forge: "github",
    instance: "github.com",
    login: "octocat",
    avatarUrl: "",
  };
  expect(user.externalId).toBe("101");
  expect(user.forge).toBe("github");
});

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
    expect(first.assignees[0]).toMatchObject({
      externalId: "42",
      forge: "github",
      instance: "github.com",
    });
    expect(first.author?.login).toBe("octocat");
    expect(first.author?.externalId).toBe("7");
    expect(first.author?.forge).toBe("github");
    expect(first.author?.instance).toBe("github.com");
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
    externalId: string,
    body: string,
    blocked: boolean,
  ): void {
    upsertIssue(
      {
        externalId,
        kind: "issue",
        repoId: coreId,
        number,
        title: `Blocked ${number}`,
        url: issueUrl("orgA/core", number),
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
    expect(getIssueListItem(coreId, 1)?.title).toBe("Alpha crash");
    expect(getIssueListItem(coreId, 999)).toBeUndefined();
  });
});

describe("milestones", () => {
  function seedMilestone(): void {
    replaceRepoMilestones(coreId, [
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
        repoId: coreId,
        number: 1,
        title: "Alpha crash",
        body: "stack trace",
        url: issueUrl("orgA/core", 1),
        state: "open",
        stateReason: null,
        author: user("7", "octocat"),
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
    const issue = getIssueListItem(coreId, 1);
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
    const [milestone] = listMilestones(coreId);
    expect(milestone).toMatchObject({
      repo: "orgA/core",
      number: 1,
      progress: 0,
      url: "https://github.com/orgA/core/milestone/1",
    });
    expect(milestone.creator).toMatchObject({
      externalId: "7",
      forge: "github",
      instance: "github.com",
      login: "octocat",
    });
    expect(getMilestone(coreId, 1)?.title).toBe("v1");
    expect(getMilestone(coreId, 99)).toBeUndefined();
  });

  test("returns the milestone's issues and filters by milestone", () => {
    seedMilestone();
    expect(numbers(milestoneIssues(coreId, 1))).toEqual([1]);
    expect(numbers(allIssues(parse("milestone=orgA/core#1")))).toEqual([1]);
    expect(numbers(allIssues(parse("milestone=none")))).toEqual([3, 6]);
  });
});
