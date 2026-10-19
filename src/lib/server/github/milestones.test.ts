import { describe, expect, test } from "bun:test";
import type { InstallationOctokit } from "./app.server";
import {
  createRepoMilestone,
  listRepoMilestones,
  toRepoMilestone,
} from "./milestones";

describe("toRepoMilestone", () => {
  test("normalizes a REST milestone, resolving dates and the creator", () => {
    const milestone = toRepoMilestone({
      id: 42,
      number: 3,
      title: "v1.0",
      description: "First release",
      state: "open",
      due_on: "2026-03-01T00:00:00Z",
      open_issues: 4,
      closed_issues: 8,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      closed_at: null,
      html_url: "https://github.com/orgA/core/milestone/3",
      creator: { id: 7, login: "octocat", avatar_url: "https://a/7" },
    });

    expect(milestone).toEqual({
      number: 3,
      githubId: 42,
      title: "v1.0",
      description: "First release",
      state: "open",
      dueOn: Date.parse("2026-03-01T00:00:00Z"),
      openIssues: 4,
      closedIssues: 8,
      creator: { githubId: 7, login: "octocat", avatarUrl: "https://a/7" },
      createdAt: Date.parse("2026-01-01T00:00:00Z"),
      updatedAt: Date.parse("2026-01-02T00:00:00Z"),
      closedAt: null,
      htmlUrl: "https://github.com/orgA/core/milestone/3",
    });
  });

  test("tolerates missing fields", () => {
    const milestone = toRepoMilestone({});
    expect(milestone).toMatchObject({
      number: 0,
      githubId: 0,
      title: "",
      state: "open",
      dueOn: null,
      creator: null,
      closedAt: null,
    });
  });
});

function fake(handler: (route: string, params: Record<string, unknown>) => unknown) {
  return {
    request: async (route: string, params: Record<string, unknown> = {}) =>
      handler(route, params),
  } as unknown as InstallationOctokit;
}

describe("listRepoMilestones", () => {
  test("paginates until a short page", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ number: i + 1, title: `m${i + 1}` }));
    const octokit = fake((_route, params) => {
      const page = Number(params.page ?? 1);
      return { data: page === 1 ? full : [{ number: 101, title: "last" }] };
    });

    const milestones = await listRepoMilestones(octokit, "orgA", "core");
    expect(milestones).toHaveLength(101);
    expect(milestones[100].number).toBe(101);
  });
});

describe("createRepoMilestone", () => {
  test("posts the title and returns the normalized record", async () => {
    let body: Record<string, unknown> | null = null;
    const octokit = fake((route, params) => {
      expect(route).toBe("POST /repos/{owner}/{repo}/milestones");
      body = params;
      return { data: { id: 9, number: 2, title: "v2", state: "open" } };
    });

    const milestone = await createRepoMilestone(octokit, "orgA", "core", {
      title: "v2",
      dueOn: "2026-05-01",
    });

    expect(body).toMatchObject({ owner: "orgA", repo: "core", title: "v2", due_on: "2026-05-01" });
    expect(milestone.number).toBe(2);
    expect(milestone.title).toBe("v2");
  });
});
