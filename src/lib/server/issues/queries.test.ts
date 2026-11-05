import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  stateCommentReaction,
  stateIntakeSubmission,
  stateIssueWaiting,
} from "#lib/server/db/schema";
import { rememberViewerReaction } from "./reaction-state";
import { createSubmission } from "#lib/server/intake/staging";
import {
  replaceRepoMilestones,
  upsertIssue,
  upsertIssues,
  upsertRepo,
  type IssueRecord,
  type UserRecord,
} from "#lib/server/sync/mirror";
import { writeBlocked } from "#lib/funnel-metadata";
import { setWaiting } from "#lib/server/waiting";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { EMPTY_FILTER, parseIssueFilter } from "./filters";
import {
  decodeCursor,
  encodeCursor,
  filterSignature,
  requireCursor,
  type CursorKey,
  type ListPage,
} from "./pagination";
import {
  allIssues,
  attentionIssues,
  boardColumnPage,
  filterContext,
  getIssueDetail,
  getIssueListItem,
  getMilestone,
  inbox,
  inboxCount,
  listMilestones,
  matrixBoard,
  matrixCellIssues,
  milestoneIssues,
  needsAssessmentIssues,
  myIssues,
  statusBoard,
  type MatrixBoard,
  waitingIssues,
} from "./queries";
import {
  seedPlanningIssue,
  seedPlanningRepo,
  type PlanningIssueSeed,
} from "#tests/planning-helpers";
import { weekStartOf } from "#lib/server/planning/calendar";
import { clearPlanItem, setPlanItem } from "#lib/server/planning/store";

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
  blocked?: boolean;
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
      blocked: input.blocked ?? false,
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
  db.delete(stateIssueWaiting).run();
  db.delete(stateCommentReaction).run();
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

  test("hydrates the planned week and filters by plan state", () => {
    const monday = weekStartOf(new Date());
    setPlanItem({
      org: "orgA",
      name: "core",
      issueNumber: 1,
      weekStart: monday,
    });
    try {
      const planned = allIssues(parse("")).items.find((issue) => issue.number === 1);
      expect(planned?.planWeek).toBe(monday);
      expect(numbers(allIssues(parse("planned=scheduled")))).toEqual([1]);
      expect(numbers(allIssues(parse("planned=unscheduled")))).toEqual([3, 6]);
      expect(numbers(allIssues(parse("planned=this-week")))).toEqual([1]);
      expect(numbers(allIssues(parse("planned=next-week")))).toEqual([]);

      // The issue detail carries the same week plus the roster the picker
      // needs to explain whether a schedule would be accepted.
      const detail = getIssueDetail(1, 1);
      expect(detail?.issue.planWeek).toBe(monday);
      expect(detail?.planning.activeMaintainers).toEqual([]);
    } finally {
      clearPlanItem("orgA", "core", 1);
    }
  });

  test("merges aggregate and viewer reaction state into comments", () => {
    db.$client.run(
      "UPDATE mirror_comment SET reactions = ? WHERE external_id = ?",
      [
        JSON.stringify({
          total: 2,
          counts: { heart: 2 },
          viewerReacted: [],
        }),
        "1001",
      ],
    );
    rememberViewerReaction(VIEWER, "orgA/core", "1001", "heart", true);

    const mine = getIssueDetail(1, 1, { viewerUserId: VIEWER });
    expect(mine?.comments[0]).toMatchObject({
      externalId: "1001",
      updatedAt: 11,
      reactions: {
        total: 2,
        counts: { heart: 2 },
        viewerReacted: ["heart"],
      },
    });

    // A system read has no acting user, so it keeps the aggregate only.
    expect(getIssueDetail(1, 1)?.comments[0].reactions).toEqual({
      total: 2,
      counts: { heart: 2 },
      viewerReacted: [],
    });
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

  test("filters unassigned issues and ORs them with named assignees", () => {
    seedExtra({
      repoId: 1,
      number: 7,
      externalId: "107",
      updatedAt: 700,
      status: "todo",
      priority: null,
    });
    expect(numbers(allIssues(parse("assignee=none")))).toEqual([7]);
    expect(
      numbers(allIssues(parse("assignee=none&assignee=octocat"))).sort(),
    ).toEqual([3, 6, 7]);
  });

  test("filters by the mirrored blocked cache", () => {
    seedExtra({
      repoId: 1,
      number: 8,
      externalId: "108",
      updatedAt: 800,
      status: "todo",
      priority: null,
      blocked: true,
    });
    expect(numbers(allIssues(parse("blocked=true")))).toEqual([8]);
    expect(numbers(allIssues(parse("blocked=false")))).toEqual([1, 3, 6]);
  });

  test("filters by the durable waiting state", () => {
    expect(
      setWaiting("orgA/core", 1, { reason: "waiting-on-reporter" }).ok,
    ).toBe(true);
    expect(numbers(allIssues(parse("waiting=true")))).toEqual([1]);
    expect(numbers(allIssues(parse("waiting=false")))).toEqual([3, 6]);
    expect(numbers(allIssues(parse("waiting=maybe")))).toEqual([1, 3, 6]);
  });

  test("combines dimensions with AND", () => {
    expect(numbers(allIssues(parse("repo=orgA/core&priority=p3&label=bug")))).toEqual([
      6,
    ]);
    expect(
      numbers(allIssues(parse("repo=orgA/core&priority=p3&label=frontend"))),
    ).toEqual([]);
  });

  test("searches titles, bodies, and comments with FTS", () => {
    expect(numbers(allIssues(parse("q=gamma")))).toEqual([3]);
    // `repro steps` exists only in issue 1's comment.
    expect(numbers(allIssues(parse("q=repro")))).toEqual([1]);
    expect(numbers(allIssues(parse("q=stack")))).toEqual([1]);
    expect(numbers(allIssues(parse("q=nomatch")))).toEqual([]);
  });

  test("supports FTS prefix terms and neutralises operators", () => {
    expect(numbers(allIssues(parse("q=gamm")))).toEqual([3]);
    // FTS operators are inert: the terms are ANDed, so no issue has all three.
    expect(numbers(allIssues(parse("q=gamma%20OR%20stack")))).toEqual([]);
    expect(numbers(allIssues(parse("q=%25")))).toEqual([]);
  });

  test("resolves #number, shortcode and owner/repo identifiers", () => {
    expect(numbers(allIssues(parse("q=%231")))).toEqual([1]);
    expect(numbers(allIssues(parse("q=CORE-1")))).toEqual([1]);
    expect(numbers(allIssues(parse("q=orgA/web%233")))).toEqual([3]);
    // An unknown shortcode is ordinary text; an unknown repo cannot match.
    expect(numbers(allIssues(parse("q=NOPE-3")))).toEqual([]);
    expect(numbers(allIssues(parse("q=orgA/ghost%233")))).toEqual([]);
  });

  test("resolves a configured shortcode via the filter context", () => {
    const ctx = {
      ...filterContext(VIEWER),
      shortcodes: { "orgA/core": "FIT" },
    };
    const filter = parseIssueFilter(new URLSearchParams("q=FIT-1"), ctx);
    expect(numbers(allIssues(filter))).toEqual([1]);
  });

  test("ANDs mixed identifiers and free text", () => {
    expect(numbers(allIssues(parse("q=%231%20crash")))).toEqual([1]);
    expect(numbers(allIssues(parse("q=%239%20crash")))).toEqual([]);
  });

  test("constrains with is:unassigned and is:blocked", () => {
    seedExtra({
      repoId: 1,
      number: 7,
      externalId: "107",
      updatedAt: 700,
      status: "todo",
      priority: null,
    });
    seedExtra({
      repoId: 1,
      number: 8,
      externalId: "108",
      updatedAt: 800,
      status: "todo",
      priority: null,
      blocked: true,
    });
    expect(numbers(allIssues(parse("q=is:unassigned")))).toEqual([8, 7]);
    expect(numbers(allIssues(parse("q=is:blocked")))).toEqual([8]);
  });

  test("constrains with label, repo, status and assignee qualifiers", () => {
    expect(numbers(allIssues(parse("q=label:bug")))).toEqual([1, 6]);
    expect(numbers(allIssues(parse("q=repo:orgA/web")))).toEqual([3]);
    expect(numbers(allIssues(parse("q=status:todo")))).toEqual([1]);
    expect(numbers(allIssues(parse("q=assignee:octocat")))).toEqual([3, 6]);
  });

  test("ANDs qualifiers with URL dimensions and free text", () => {
    // Both labels are required; label:bug AND the URL's label=frontend is empty.
    expect(numbers(allIssues(parse("q=label:bug&label=frontend")))).toEqual([]);
    expect(numbers(allIssues(parse("q=label:bug&status=todo")))).toEqual([1]);
    expect(numbers(allIssues(parse("q=label:bug%20zeta")))).toEqual([6]);
    // Disjoint repo constraints narrow to nothing rather than ORing.
    expect(numbers(allIssues(parse("q=repo:orgA/web&repo=orgA/core")))).toEqual(
      [],
    );
    expect(
      numbers(allIssues(parse("q=is:unassigned&assignee=octocat"))),
    ).toEqual([]);
  });

  test("keeps the selected sort for search results", () => {
    seedExtra({
      repoId: 1,
      number: 7,
      externalId: "107",
      title: "Issue searchable",
      updatedAt: 700,
      status: "todo",
      priority: "P1",
    });
    seedExtra({
      repoId: 1,
      number: 8,
      externalId: "108",
      title: "Issue also searchable",
      updatedAt: 800,
      status: "todo",
      priority: "P3",
    });
    expect(numbers(allIssues(parse("q=searchable")))).toEqual([7, 8]);
    expect(numbers(allIssues(parse("q=searchable&sort=updated&direction=desc")))).toEqual([
      8, 7,
    ]);
  });
});

describe("search at mirror scale", () => {
  beforeEach(() => {
    clearMirror();
    setConfig(TEST_CONFIG);
  });

  test("finds a unique body term among 750 issues", () => {
    const repo = upsertRepo({
      externalId: "1",
      forge: "github",
      instance: "github.com",
      org: "orgA",
      name: "core",
      url: "",
      archived: false,
    });
    const issues: IssueRecord[] = Array.from({ length: 750 }, (_, index) => {
      const number = index + 1;
      return {
        externalId: String(10_000 + number),
        repoId: repo.id,
        number,
        kind: "issue",
        title: `Bulk issue ${number}`,
        body: number === 433 ? "unique needle in a haystack" : `body ${number}`,
        state: "open",
        stateReason: null,
        author: null,
        milestoneNumber: null,
        url: "",
        createdAt: 1,
        updatedAt: number,
        closedAt: null,
        labels: ["todo"],
        assignees: [],
        comments: [],
      };
    });
    upsertIssues(issues, {
      status: "todo",
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      labelConflict: false,
    });

    expect(numbers(allIssues(parse("q=needle")))).toEqual([433]);
    expect(numbers(allIssues(parse("q=%23433")))).toEqual([433]);
    expect(numbers(allIssues(parse("q=body%20750")))).toEqual([750]);
  });
});

describe("sorting", () => {
  test("priority descending flips the rank but keeps ties newest-first", () => {
    expect(numbers(allIssues(parse("sort=priority&direction=desc")))).toEqual([
      6, 3, 1,
    ]);
  });

  test("updated applies the direction to the timestamp and tie-breakers", () => {
    expect(numbers(allIssues(parse("sort=updated")))).toEqual([6, 1, 3]);
    expect(numbers(allIssues(parse("sort=updated&direction=desc")))).toEqual([
      3, 1, 6,
    ]);
  });

  test("created applies the direction to the timestamp and tie-breakers", () => {
    // All seeded issues share createdAt=1, so the repoId/number tie-breakers
    // (which follow the direction) decide the order.
    expect(numbers(allIssues(parse("sort=created")))).toEqual([1, 6, 3]);
    expect(numbers(allIssues(parse("sort=created&direction=desc")))).toEqual([
      3, 6, 1,
    ]);
  });

  test("title sorts case-insensitively with the same tie-breakers", () => {
    seedExtra({
      repoId: 1,
      number: 7,
      externalId: "107",
      title: "aardvark",
      updatedAt: 700,
      status: "todo",
      priority: null,
    });
    // Binary collation would put "Alpha" before "aardvark"; NOCASE does not.
    expect(numbers(allIssues(parse("sort=title")))).toEqual([7, 1, 3, 6]);
    expect(numbers(allIssues(parse("sort=title&direction=desc")))).toEqual([
      6, 3, 1, 7,
    ]);
  });

  test("each sort walks its pages through a matching cursor", () => {
    seedExtra({
      repoId: 1,
      number: 7,
      externalId: "107",
      title: "aardvark",
      updatedAt: 700,
      status: "todo",
      priority: null,
    });
    const queries = [
      "sort=priority",
      "sort=priority&direction=desc",
      "sort=updated",
      "sort=updated&direction=desc",
      "sort=created",
      "sort=created&direction=desc",
      "sort=title",
      "sort=title&direction=desc",
    ];
    for (const query of queries) {
      const expected = numbers(allIssues(parse(query)));
      const walked: number[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = allIssues(parse(query), { limit: 1, cursor });
        walked.push(...numbers(page));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      expect(walked).toEqual(expected);
    }
  });
});

describe("myIssues", () => {
  test("restricts to the viewer's assignments", () => {
    expect(numbers(myIssues(parse(""), VIEWER))).toEqual([1]);
  });

  test("still applies the other dimensions", () => {
    expect(numbers(myIssues(parse("repo=orgA/web"), VIEWER))).toEqual([]);
  });

  test("clears the unassigned sentinel before applying the viewer clause", () => {
    expect(numbers(myIssues(parse("assignee=none"), VIEWER))).toEqual([1]);
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

  test("returns blocked issues without a usable re-check date", () => {
    seedBlockedIssue(7, "107", withRecheck("2026-10-25"), true);
    // Blocked but no metadata at all.
    seedBlockedIssue(8, "108", "plain body", true);
    // Blocked with a malformed re-check date.
    seedBlockedIssue(
      9,
      "109",
      writeBlocked("desc", {
        blocker: "Upstream API key",
        needs: "Token",
        trying: "",
        recheck: "not-a-date",
      }),
      true,
    );
    // Has a valid date in the body but is not flagged blocked.
    seedBlockedIssue(10, "110", withRecheck("2026-10-20"), false);

    const items = attentionIssues();
    expect(items.map((item) => [item.issue.number, item.recheck])).toEqual([
      [7, "2026-10-25"],
      [8, ""],
      [9, ""],
    ]);
    expect(items[0].blocker).toBe("Upstream API key");
  });

  test("exposes the stored block reason for revise-in-place", () => {
    seedBlockedIssue(
      13,
      "113",
      writeBlocked("desc", {
        blocker: "Upstream API key",
        needs: "Token",
        trying: "",
        recheck: "2026-10-25",
        reason: "dependency",
      }),
      true,
    );

    const item = attentionIssues().find((entry) => entry.issue.number === 13);
    expect(item?.reason).toBe("dependency");
    // The page hands this straight to BlockActionDialog's `initial`.
    expect({ reason: item?.reason }).toEqual({ reason: "dependency" });
  });

  test("treats calendar-invalid dates as unscheduled", () => {
    seedBlockedIssue(11, "111", withRecheck("2026-02-30"), true);
    expect(attentionIssues().map((item) => [item.issue.number, item.recheck])).toEqual([
      [11, ""],
    ]);
  });

  test("orders equal re-check dates by issue number", () => {
    seedBlockedIssue(12, "112", withRecheck("2026-10-25"), true);
    seedBlockedIssue(11, "111", withRecheck("2026-10-25"), true);
    expect(attentionIssues().map((item) => item.issue.number)).toEqual([11, 12]);
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

describe("waitingIssues", () => {
  function seedWaitingIssue(
    number: number,
    externalId: string,
    state: "open" | "closed" = "open",
  ): void {
    upsertIssue(
      {
        externalId,
        kind: "issue",
        url: "",
        repoId: 1,
        number,
        title: `Waiting ${number}`,
        body: "",
        state,
        stateReason: state === "closed" ? "completed" : null,
        author: null,
        milestoneNumber: null,
        createdAt: 1,
        updatedAt: 600,
        closedAt: state === "closed" ? 700 : null,
        labels: ["todo"],
        assignees: [],
        comments: [],
      },
      {
        status: "todo",
        impact: null,
        urgency: null,
        priority: null,
        size: null,
        blocked: false,
        labelConflict: false,
      },
    );
  }

  const NOW = new Date(2026, 9, 18, 12).getTime();
  const DAY_MS = 86_400_000;

  test("returns open waiting issues with reason, date and stale flag", () => {
    seedWaitingIssue(21, "121");
    seedWaitingIssue(22, "122");
    setWaiting(
      "orgA/core",
      21,
      { reason: "waiting-on-vendor", note: "Ticket 42", recheckOn: "2026-10-25" },
      null,
      NOW - 2 * DAY_MS,
    );
    setWaiting(
      "orgA/core",
      22,
      { reason: "needs-info" },
      null,
      NOW - 8 * DAY_MS,
    );

    const items = waitingIssues(NOW);
    expect(
      items.map((item) => [
        item.issue.number,
        item.reason,
        item.note,
        item.recheckOn,
        item.stale,
      ]),
    ).toEqual([
      [22, "needs-info", null, null, true],
      [21, "waiting-on-vendor", "Ticket 42", "2026-10-25", false],
    ]);
  });

  test("omits waiting rows whose issue is closed or no longer mirrored", () => {
    seedWaitingIssue(23, "123", "closed");
    setWaiting("orgA/core", 23, { reason: "other" });
    setWaiting("orgA/core", 99, { reason: "other" });
    expect(waitingIssues(NOW)).toEqual([]);
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
        Buffer.from(JSON.stringify({ v: 1, f: signature, k: [0, 100] })).toString("base64url"),
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
    expect(filterSignature(parse("sort=title"))).not.toBe(filterSignature(parse("")));
    expect(filterSignature(parse("direction=desc"))).not.toBe(
      filterSignature(parse("")),
    );
    expect(filterSignature(parse("blocked=true"))).not.toBe(
      filterSignature(parse("blocked=false")),
    );
    expect(filterSignature(parse("assignee=none"))).not.toBe(
      filterSignature(parse("")),
    );
  });

  test("round-trips a title cursor and rejects a numeric one for the same sort", () => {
    const signature = filterSignature(parse("sort=title"));
    const cursor = encodeCursor(signature, ["Alpha", 1, 1]);
    expect(decodeCursor(cursor, signature, "text")).toEqual(["Alpha", 1, 1]);
    expect(decodeCursor(cursor, signature, "number")).toBeNull();
    const numeric = encodeCursor(signature, [0, 1, 1]);
    expect(decodeCursor(numeric, signature, "text")).toBeNull();
  });

  test("the feed cursor check accepts a title cursor for title sort", () => {
    const signature = filterSignature(parse("sort=title"));
    const cursor = encodeCursor(signature, ["Alpha", 1, 1]);

    expect(() => requireCursor(cursor, signature, "text")).not.toThrow();
    expect(() => requireCursor(cursor, signature, "number")).toThrow(
      "Invalid cursor",
    );
  });

  test("a cursor from a different sort is rejected", () => {
    const titleCursor = encodeCursor(filterSignature(parse("sort=title")), [
      "Alpha",
      1,
      1,
    ]);
    const page = allIssues(parse(""), { cursor: titleCursor });
    expect(numbers(page)).toEqual([1, 3, 6]);
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

describe("matrixBoard", () => {
  function matrixSeed(): number {
    const repo = seedPlanningRepo("acme/widgets");
    const add = (number: number, impact: number | null, urgency: number | null, extra: Partial<PlanningIssueSeed> = {}) =>
      seedPlanningIssue({ repoId: repo, number, impact, urgency, ...extra });
    add(1, 1, 1); add(2, 1, null); add(3, null, 2); add(4, null, null);
    add(5, 3, 3, { status: "todo" });
    add(6, 2, 2, { state: "closed", stateReason: "completed" });
    return repo;
  }
  function cell(board: MatrixBoard, impact: number, urgency: number) {
    return board.cells.find((entry) => entry.impact === impact && entry.urgency === urgency)!;
  }

  function numbers(page: ListPage<{ number: number }>): number[] {
    return page.items.map((issue) => issue.number);
  }

  // The file-level `beforeEach` seeds orgA rows with both axes unset, which
  // would land in the (null, null) cell and skew these exact counts; the matrix
  // cases reset the mirror so `matrixSeed` is the only data present.
  beforeEach(() => {
    clearMirror();
  });

  test("matrix counts the nine classified cells and separates unassessed work", () => {
    matrixSeed();
    const board = matrixBoard({ ...EMPTY_FILTER, states: ["open"] });
    expect(board.cells).toHaveLength(9);
    expect(board.cells.every((entry) => entry.impact !== null && entry.urgency !== null)).toBe(
      true,
    );
    expect(cell(board, 1, 1).total).toBe(1);
    expect(cell(board, 3, 3).total).toBe(1);
    expect(cell(board, 2, 2).total).toBe(0);
    // #2 (impact only), #3 (urgency only) and #4 (neither) stay out of cells.
    expect(board.total).toBe(5);
    expect(board.rated).toBe(2);
    expect(board.needsAssessment).toBe(3);
  });

  test("applies the search and status dimensions to counts", () => {
    matrixSeed();
    const todo = matrixBoard({ ...EMPTY_FILTER, states: ["open"], statuses: ["todo"] });
    expect(cell(todo, 3, 3).total).toBe(1);
    expect(cell(todo, 1, 1).total).toBe(0);

    const searched = matrixBoard({ ...EMPTY_FILTER, states: ["open"], search: "Issue 5" });
    expect(searched.total).toBe(1);
    expect(cell(searched, 3, 3).total).toBe(1);
  });

  test("does not special-case state or status", () => {
    matrixSeed();
    const board = matrixBoard({ ...EMPTY_FILTER });
    expect(board.total).toBe(6);
    expect(cell(board, 2, 2).total).toBe(1); // closed #6
    expect(cell(board, 1, 1).total).toBe(1); // untriaged #1
  });

  test("cell issues are scoped to the pair and paginate in stream order", () => {
    const repo = seedPlanningRepo("acme/widgets");
    for (let number = 1; number <= 6; number += 1) {
      seedPlanningIssue({
        repoId: repo,
        number,
        impact: 1,
        urgency: 1,
        priority: "P1",
        updatedAt: number,
      });
    }
    seedPlanningIssue({ repoId: repo, number: 7, impact: 1, urgency: 2, priority: "P1" });
    seedPlanningIssue({ repoId: repo, number: 8, impact: 2, urgency: 1, priority: "P1" });
    seedPlanningIssue({ repoId: repo, number: 9, impact: null, urgency: 1 });

    const first = matrixCellIssues(
      { ...EMPTY_FILTER, states: ["open"] },
      1,
      1,
      { limit: 3 },
    );
    expect(first.total).toBe(6);
    expect(numbers(first)).toEqual([6, 5, 4]);
    expect(first.nextCursor).not.toBeNull();

    const second = matrixCellIssues(
      { ...EMPTY_FILTER, states: ["open"] },
      1,
      1,
      { limit: 3, cursor: first.nextCursor },
    );
    expect(numbers(second)).toEqual([3, 2, 1]);
    expect(second.nextCursor).toBeNull();
  });

  test("the assessment queue holds issues missing either or both axes", () => {
    matrixSeed();
    const queue = needsAssessmentIssues({ ...EMPTY_FILTER, states: ["open"] });
    expect(queue.total).toBe(3);
    expect(numbers(queue).sort((a, b) => a - b)).toEqual([2, 3, 4]);

    const filtered = needsAssessmentIssues({
      ...EMPTY_FILTER,
      states: ["open"],
      search: "Issue 2",
    });
    expect(numbers(filtered)).toEqual([2]);
  });
});
