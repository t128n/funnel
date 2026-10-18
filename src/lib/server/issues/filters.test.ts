import { describe, expect, test } from "bun:test";
import {
  buildIssueWhere,
  EMPTY_FILTER,
  escapeLike,
  parseIssueFilter,
  type FilterContext,
} from "./filters";

const ctx: FilterContext = {
  repos: [
    { githubId: 1, org: "orgA", name: "core" },
    { githubId: 2, org: "orgA", name: "web" },
  ],
  viewerGithubId: 42,
  resolveLogin: (login) => (login === "octocat" ? 7 : undefined),
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

  test("resolves assignee me / login / numeric ids", () => {
    expect(
      parseIssueFilter(new URLSearchParams("assignee=me"), ctx).assignees,
    ).toEqual([42]);
    expect(
      parseIssueFilter(new URLSearchParams("assignee=octocat"), ctx).assignees,
    ).toEqual([7]);
    expect(
      parseIssueFilter(new URLSearchParams("assignee=8"), ctx).assignees,
    ).toEqual([8]);
    expect(
      parseIssueFilter(new URLSearchParams("assignee=ghost"), ctx).assignees,
    ).toEqual([]);
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
});
