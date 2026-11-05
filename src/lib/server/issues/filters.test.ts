import { beforeEach, describe, expect, test } from "bun:test";
import { buildVocabulary } from "#lib/labels";
import { db } from "#lib/server/db/index";
import { mirrorThread } from "#lib/server/db/schema";
import {
  setIssueTypes,
  upsertIssue,
  upsertRepo,
} from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";
import {
  buildIssueWhere,
  EMPTY_FILTER,
  escapeLike,
  groupOf,
  parseIssueFilter,
  type IssueFilter,
  type IssueFilterContext,
} from "./filters";

const ctx: IssueFilterContext = {
  repos: [
    { id: 1, org: "orgA", name: "core" },
    { id: 2, org: "orgA", name: "web" },
  ],
  viewerExternalId: "42",
  resolveLogin: (login) => (login === "octocat" ? "7" : undefined),
};

describe("parseIssueFilter", () => {
  test("accepts repeated and comma-joined values", () => {
    const filter = parseIssueFilter(
      new URLSearchParams("status=todo,blocked&status=in-review&priority=p1"),
      ctx,
    );
    expect(filter.statuses).toEqual(["todo", "in-review"]);
    expect(filter.priorities).toEqual(["p1"]);
  });

  test("resolves owner/name repos case-insensitively and drops unknowns", () => {
    const filter = parseIssueFilter(
      new URLSearchParams("repo=ORGA/Core&repo=orgA/ghost"),
      ctx,
    );
    expect(filter.repos).toEqual([1]);
  });

  test("resolves assignee me / login / numeric external ids", () => {
    expect(
      parseIssueFilter(new URLSearchParams("assignee=me"), ctx).assignees,
    ).toEqual(["42"]);
    expect(
      parseIssueFilter(new URLSearchParams("assignee=octocat"), ctx).assignees,
    ).toEqual(["7"]);
    expect(
      parseIssueFilter(new URLSearchParams("assignee=8"), ctx).assignees,
    ).toEqual(["8"]);
    expect(
      parseIssueFilter(new URLSearchParams("assignee=ghost"), ctx).assignees,
    ).toEqual([]);
  });

  test("keeps unassigned separate and ORs it with named assignees", () => {
    const filter = parseIssueFilter(
      new URLSearchParams("assignee=octocat&assignee=none"),
      ctx,
    );
    expect(filter.assignees).toEqual(["7"]);
    expect(filter.unassigned).toBe(true);
    expect(parseIssueFilter(new URLSearchParams("assignee=none"), ctx).unassigned).toBe(
      true,
    );
    expect(parseIssueFilter(new URLSearchParams(""), ctx).unassigned).toBe(false);
  });

  test("parses the blocked dimension and ignores unknown values", () => {
    expect(
      parseIssueFilter(new URLSearchParams("blocked=true"), ctx).blocked,
    ).toBe(true);
    expect(
      parseIssueFilter(new URLSearchParams("blocked=false"), ctx).blocked,
    ).toBe(false);
    expect(
      parseIssueFilter(new URLSearchParams("blocked=yes"), ctx).blocked,
    ).toBeNull();
    expect(parseIssueFilter(new URLSearchParams(""), ctx).blocked).toBeNull();
  });

  test("parses the waiting dimension and ignores unknown values", () => {
    expect(
      parseIssueFilter(new URLSearchParams("waiting=true"), ctx).waiting,
    ).toBe(true);
    expect(
      parseIssueFilter(new URLSearchParams("waiting=false"), ctx).waiting,
    ).toBe(false);
    expect(
      parseIssueFilter(new URLSearchParams("waiting=yes"), ctx).waiting,
    ).toBeNull();
    expect(parseIssueFilter(new URLSearchParams(""), ctx).waiting).toBeNull();
  });

  test("parses sort and direction with safe defaults", () => {
    expect(parseIssueFilter(new URLSearchParams(""), ctx)).toMatchObject({
      sort: "priority",
      direction: "asc",
    });
    expect(
      parseIssueFilter(
        new URLSearchParams("sort=updated&direction=DESC"),
        ctx,
      ),
    ).toMatchObject({ sort: "updated", direction: "desc" });
    expect(
      parseIssueFilter(
        new URLSearchParams("sort=title&direction=bogus"),
        ctx,
      ),
    ).toMatchObject({ sort: "title", direction: "asc" });
    expect(
      parseIssueFilter(new URLSearchParams("sort=bogus"), ctx).sort,
    ).toBe("priority");
  });

  test("drops me when no viewer external id is present", () => {
    expect(
      parseIssueFilter(new URLSearchParams("assignee=me"), {
        ...ctx,
        viewerExternalId: null,
      }).assignees,
    ).toEqual([]);
  });

  test("validates the plan-state dimension", () => {
    expect(
      parseIssueFilter(
        new URLSearchParams("planned=this-week,unscheduled&planned=bogus"),
        ctx,
      ).planned,
    ).toEqual(["this-week", "unscheduled"]);
  });

  test("validates the state dimension", () => {
    expect(
      parseIssueFilter(new URLSearchParams("state=OPEN,closed"), ctx).states,
    ).toEqual(["open", "closed"]);
    expect(
      parseIssueFilter(new URLSearchParams("state=none&state=bogus"), ctx).states,
    ).toEqual([]);
  });

  test("keeps the none sentinel and validates vocabularies", () => {
    const filter = parseIssueFilter(
      new URLSearchParams("status=none&priority=nope&size=lg,xxl"),
      ctx,
    );
    expect(filter.statuses).toEqual(["none"]);
    expect(filter.priorities).toEqual([]);
    expect(filter.sizes).toEqual(["lg"]);
  });

  test("excludes reserved labels from the label dimension", () => {
    const filter = parseIssueFilter(
      new URLSearchParams("label=bug&label=todo&label=frontend"),
      ctx,
    );
    expect(filter.labels).toEqual(["bug", "frontend"]);
  });

  test("excludes prefixed reserved labels but keeps old names as ordinary labels", () => {
    const prefixed: IssueFilterContext = {
      ...ctx,
      vocabulary: buildVocabulary("funnel"),
    };
    const filter = parseIssueFilter(
      new URLSearchParams(
        "label=bug&label=funnel-todo&label=todo&label=funnel-sm&status=todo&size=sm",
      ),
      prefixed,
    );
    // URL values stay logical; only the label dimension holds actual names.
    expect(filter.labels).toEqual(["bug", "todo"]);
    expect(filter.statuses).toEqual(["todo"]);
    expect(filter.sizes).toEqual(["sm"]);
  });

  test("resolves repo-scoped milestone slugs and the none sentinel", () => {
    const filter = parseIssueFilter(
      new URLSearchParams(
        "milestone=orgA/core#3&milestone=ORGA/Web#7&milestone=orgA/ghost#1&milestone=none",
      ),
      ctx,
    );
    expect(filter.milestones).toEqual([
      { repoId: 1, number: 3 },
      { repoId: 2, number: 7 },
    ]);
    expect(filter.noMilestone).toBe(true);
  });

  test("drops malformed milestone values", () => {
    const filter = parseIssueFilter(
      new URLSearchParams("milestone=orgA/core&milestone=orgA/core#x&milestone=#2"),
      ctx,
    );
    expect(filter.milestones).toEqual([]);
    expect(filter.noMilestone).toBe(false);
  });

  test("parses repeated and comma-joined issue types case-insensitively", () => {
    const filter = parseIssueFilter(
      new URLSearchParams("type=Bug,Feature&type=bug&type= task "),
      ctx,
    );
    expect(filter.types).toEqual(["Bug", "Feature", "task"]);
  });

  test("parses the untyped sentinel and keeps unknown names", () => {
    expect(
      parseIssueFilter(
        new URLSearchParams("type=NONE&type=none&type=Ghost"),
        ctx,
      ).types,
    ).toEqual(["none", "Ghost"]);
    expect(parseIssueFilter(new URLSearchParams(""), ctx).types).toEqual([]);
  });

  test("trims and caps the search term", () => {
    const long = "x".repeat(300);
    expect(parseIssueFilter(new URLSearchParams(`q=  hi  `), ctx).search).toBe(
      "hi",
    );
    expect(
      parseIssueFilter(new URLSearchParams(`q=${long}`), ctx).search.length,
    ).toBe(200);
  });
});

describe("escapeLike", () => {
  test("escapes LIKE metacharacters", () => {
    expect(escapeLike("100%_done\\")).toBe("100\\%\\_done\\\\");
  });
});

describe("buildIssueWhere", () => {
  test("returns undefined for an empty filter", () => {
    expect(buildIssueWhere(EMPTY_FILTER)).toBeUndefined();
  });

  test("returns a clause once any dimension is populated", () => {
    expect(buildIssueWhere({ ...EMPTY_FILTER, statuses: ["todo"] })).toBeDefined();
  });

  test("resolves reserved groups against a configured vocabulary", () => {
    const vocabulary = buildVocabulary("funnel");
    expect(groupOf("funnel-todo", vocabulary)).toBe("status");
    expect(groupOf("todo", vocabulary)).toBeUndefined();
  });

  test("builds a clause for repo-scoped milestones and the none sentinel", () => {
    expect(
      buildIssueWhere({ ...EMPTY_FILTER, milestones: [{ repoId: 1, number: 3 }] }),
    ).toBeDefined();
    expect(buildIssueWhere({ ...EMPTY_FILTER, noMilestone: true })).toBeDefined();
  });

  test("builds clauses for unassigned and blocked", () => {
    expect(buildIssueWhere({ ...EMPTY_FILTER, unassigned: true })).toBeDefined();
    expect(
      buildIssueWhere({ ...EMPTY_FILTER, assignees: ["7"], unassigned: true }),
    ).toBeDefined();
    expect(buildIssueWhere({ ...EMPTY_FILTER, blocked: true })).toBeDefined();
    expect(buildIssueWhere({ ...EMPTY_FILTER, blocked: false })).toBeDefined();
    expect(buildIssueWhere({ ...EMPTY_FILTER, blocked: null })).toBeUndefined();
    expect(buildIssueWhere({ ...EMPTY_FILTER, waiting: true })).toBeDefined();
    expect(buildIssueWhere({ ...EMPTY_FILTER, waiting: false })).toBeDefined();
    expect(buildIssueWhere({ ...EMPTY_FILTER, waiting: null })).toBeUndefined();
  });
});

describe("buildIssueWhere issue types", () => {
  let repoId = 0;

  function seedIssue(number: number, issueType: string | null): void {
    upsertIssue(
      {
        externalId: `I_${number}`,
        repoId,
        number,
        kind: "issue",
        title: `Issue ${number}`,
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
    setIssueTypes(repoId, new Map([[number, issueType]]));
  }

  function numbers(filter: IssueFilter): number[] {
    return db
      .select({ number: mirrorThread.number })
      .from(mirrorThread)
      .where(buildIssueWhere(filter))
      .orderBy(mirrorThread.number)
      .all()
      .map((row) => row.number);
  }

  beforeEach(() => {
    clearMirror();
    repoId = upsertRepo({
      externalId: "1",
      forge: "github",
      instance: "github.com",
      org: "orgA",
      name: "core",
      url: "https://github.com/orgA/core",
      archived: false,
    }).id;
    seedIssue(1, "Bug");
    seedIssue(2, "Feature");
    seedIssue(3, null);
  });

  test("matches a typed name case-insensitively", () => {
    expect(numbers({ ...EMPTY_FILTER, types: ["bug"] })).toEqual([1]);
  });

  test("ORs several type names", () => {
    expect(numbers({ ...EMPTY_FILTER, types: ["Bug", "Feature"] })).toEqual([
      1, 2,
    ]);
  });

  test("treats none as untyped (NULL or empty)", () => {
    expect(numbers({ ...EMPTY_FILTER, types: ["none"] })).toEqual([3]);
  });

  test("ORs named types with the untyped sentinel", () => {
    expect(numbers({ ...EMPTY_FILTER, types: ["Bug", "none"] })).toEqual([
      1, 3,
    ]);
  });

  test("an unknown type matches nothing", () => {
    expect(numbers({ ...EMPTY_FILTER, types: ["Ghost"] })).toEqual([]);
  });
});
