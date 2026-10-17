import { beforeEach, describe, expect, test } from "bun:test";
import { clearMirror } from "#tests/mirror-helpers";
import * as mirror from "./mirror";

beforeEach(() => {
  clearMirror();
});

function seedRepo() {
  return mirror.upsertRepo({
    githubId: 1,
    org: "orgA",
    name: "core",
    archived: false,
  });
}

function seedIssue(number: number, updatedAt: number) {
  mirror.upsertIssue(
    {
      githubId: 1000 + number,
      repoId: 1,
      number,
      title: `issue ${number}`,
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneName: null,
      createdAt: updatedAt,
      updatedAt,
      closedAt: null,
      labels: ["todo"],
      assignees: [],
      comments: [],
    },
    { status: "todo", priority: null, size: null, labelConflict: false },
  );
}

describe("repo upsert", () => {
  test("creates then updates in place", () => {
    const created = seedRepo();
    expect(created).toMatchObject({ githubId: 1, org: "orgA", name: "core" });

    const updated = mirror.upsertRepo({
      githubId: 1,
      org: "orgA",
      name: "renamed",
      archived: true,
    });
    expect(updated.name).toBe("renamed");
    expect(updated.archived).toBe(1);
    expect(mirror.listRepos()).toHaveLength(1);
  });
});

describe("cursor", () => {
  test("is null before backfill and the newest updated_at after", () => {
    seedRepo();
    expect(mirror.getRepoCursor(1)).toBeNull();
    seedIssue(1, 1000);
    seedIssue(2, 3000);
    seedIssue(3, 2000);
    expect(mirror.getRepoCursor(1)).toBe(3000);
  });
});

describe("issue upsert", () => {
  test("replaces labels and assignees on re-hydration", () => {
    seedRepo();
    seedIssue(1, 1000);
    expect(mirror.getIssueLabels(1, 1)).toEqual(["todo"]);

    mirror.upsertIssue(
      {
        githubId: 1001,
        repoId: 1,
        number: 1,
        title: "issue 1",
        body: "edited",
        state: "open",
        stateReason: null,
        author: null,
        milestoneName: null,
        createdAt: 1000,
        updatedAt: 2000,
        closedAt: null,
        labels: ["in-progress"],
        assignees: [],
        comments: [],
      },
      { status: "in-progress", priority: null, size: null, labelConflict: false },
    );

    expect(mirror.getIssue(1, 1)?.body).toBe("edited");
    expect(mirror.getIssue(1, 1)?.status).toBe("in-progress");
    expect(mirror.getIssueLabels(1, 1)).toEqual(["in-progress"]);
  });
});

describe("pruning", () => {
  test("deleteIssuesNotIn removes only absent rows", () => {
    seedRepo();
    seedIssue(1, 1000);
    seedIssue(2, 2000);
    seedIssue(3, 3000);

    const removed = mirror.deleteIssuesNotIn(1, [1, 3]);

    expect(removed).toBe(1);
    expect(mirror.getIssue(1, 2)).toBeUndefined();
    expect(mirror.getIssue(1, 1)).toBeDefined();
    expect(mirror.getIssue(1, 3)).toBeDefined();
  });
});

describe("repo labels", () => {
  test("replaces the full set", () => {
    seedRepo();
    mirror.replaceRepoLabels(1, [
      { name: "bug", color: "ff0000", description: "" },
    ]);
    expect(mirror.getRepoLabels(1)).toEqual([
      { name: "bug", color: "ff0000", description: "" },
    ]);

    mirror.replaceRepoLabels(1, [
      { name: "todo", color: "78a9ff", description: "Status: Todo" },
    ]);
    expect(mirror.getRepoLabels(1)).toEqual([
      { name: "todo", color: "78a9ff", description: "Status: Todo" },
    ]);
  });
});

describe("repo assignees", () => {
  test("upserts users and replaces the full set, sorted by login", () => {
    seedRepo();
    mirror.replaceRepoAssignees(1, [
      { githubId: 42, login: "zoe", avatarUrl: "z" },
      { githubId: 41, login: "amy", avatarUrl: "a" },
    ]);
    expect(mirror.getRepoAssignees(1)).toEqual([
      { githubId: 41, login: "amy", avatarUrl: "a" },
      { githubId: 42, login: "zoe", avatarUrl: "z" },
    ]);

    mirror.replaceRepoAssignees(1, [
      { githubId: 43, login: "bob", avatarUrl: "b" },
    ]);
    expect(mirror.getRepoAssignees(1)).toEqual([
      { githubId: 43, login: "bob", avatarUrl: "b" },
    ]);
  });
});
