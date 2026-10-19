import { describe, expect, test } from "bun:test";
import { buildGroups } from "./grouping";
import type { IssueListItem } from "#lib/server/issues/types";

/** Minimal issue fixture; overrides supply the fields a test cares about. */
function issue(overrides: Partial<IssueListItem> & { number: number }): IssueListItem {
  return {
    repoId: 1,
    repo: "orgA/core",
    title: `Issue ${overrides.number}`,
    state: "open",
    stateReason: null,
    status: null,
    priority: null,
    size: null,
    blocked: false,
    labelConflict: false,
    createdAt: 0,
    updatedAt: 0,
    closedAt: null,
    author: null,
    assignees: [],
    milestone: null,
    labels: [],
    ...overrides,
  };
}

const PROJECTS = [
  { label: "project1", name: "Project One" },
  { label: "project2", name: "Project Two" },
];

describe("buildGroups / project", () => {
  test("repeats an issue into every matching project section", () => {
    const groups = buildGroups(
      [
        issue({ number: 1, labels: ["project1"] }),
        issue({ number: 2, labels: ["project2", "bug"] }),
        issue({ number: 3, labels: ["project1", "project2"] }),
      ],
      "project",
      {},
      PROJECTS
    );

    expect(groups.map((group) => [group.key, group.label, group.issues.length])).toEqual([
      ["project1", "Project One", 2],
      ["project2", "Project Two", 2],
    ]);
    // Issue 3 spans both projects.
    expect(groups[0].issues.map((entry) => entry.number)).toEqual([1, 3]);
    expect(groups[1].issues.map((entry) => entry.number)).toEqual([2, 3]);
  });

  test("matches labels case-insensitively", () => {
    const groups = buildGroups(
      [issue({ number: 1, labels: ["PROJECT1"] })],
      "project",
      {},
      PROJECTS
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Project One");
  });

  test("buckets unmatched issues under 'No project', sorted last", () => {
    const groups = buildGroups(
      [
        issue({ number: 1, labels: ["bug"] }),
        issue({ number: 2, labels: ["project2"] }),
      ],
      "project",
      {},
      PROJECTS
    );

    expect(groups.map((group) => [group.label, group.issues.length])).toEqual([
      ["Project Two", 1],
      ["No project", 1],
    ]);
  });

  test("follows configured order and honours an explicit name default", () => {
    const groups = buildGroups(
      [
        issue({ number: 1, labels: ["beta"] }),
        issue({ number: 2, labels: ["alpha"] }),
      ],
      "project",
      {},
      [
        { label: "alpha", name: "Alpha" },
        { label: "beta", name: "beta" },
      ]
    );

    expect(groups.map((group) => group.label)).toEqual(["Alpha", "beta"]);
  });

  test("returns no groups when project grouping is requested without projects", () => {
    expect(buildGroups([issue({ number: 1, labels: ["project1"] })], "project")).toEqual([]);
  });

  test("repository grouping still works alongside project grouping", () => {
    const groups = buildGroups(
      [
        issue({ number: 1, repo: "orgA/core" }),
        issue({ number: 2, repo: "orgA/web" }),
      ],
      "repo",
      { "orgA/core": "CORE", "orgA/web": "WEB" },
      PROJECTS
    );

    expect(groups.map((group) => group.label)).toEqual(["CORE", "WEB"]);
  });
});
