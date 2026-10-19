import { describe, expect, test } from "bun:test";
import type { InstallationOctokit } from "#lib/server/github/app.server";
import {
  deriveMetadata,
  fetchTimeline,
  parseTimeline,
  resolveIssueConflict,
  resolveWinners,
} from "./conflicts";

describe("deriveMetadata", () => {
  test("projects a clean label set onto the reserved groups", () => {
    expect(
      deriveMetadata(["todo", "sev", "high", "md", "bug", "frontend"]),
    ).toEqual({
      status: "todo",
      impact: 1,
      urgency: 1,
      priority: "P1",
      size: "md",
      blocked: false,
      conflicts: [],
    });
  });

  test("treats a missing group as unset", () => {
    expect(deriveMetadata(["p2"])).toEqual({
      status: null,
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      conflicts: [],
    });
  });

  test("derives priority from the two axes", () => {
    expect(deriveMetadata(["mod", "low"]).priority).toBe("P3");
    expect(deriveMetadata(["min", "high"]).priority).toBe("P2");
    expect(deriveMetadata(["min"]).priority).toBe("P3");
  });

  test("flags a multi-label impact group", () => {
    const derived = deriveMetadata(["sev", "min", "high"]);
    expect(derived.impact).toBe(1);
    expect(derived.priority).toBe("P1");
    expect(derived.conflicts).toEqual(["impact"]);
  });

  test("reads the blocked flag as orthogonal to status", () => {
    expect(deriveMetadata(["in-progress", "blocked", "p1"])).toEqual({
      status: "in-progress",
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: true,
      conflicts: [],
    });
  });

  test("flags a multi-label group and picks deterministically", () => {
    const derived = deriveMetadata(["in-progress", "todo"]);
    // Canonical vocabulary order puts `todo` before `in-progress`.
    expect(derived.status).toBe("todo");
    expect(derived.conflicts).toEqual(["status"]);
  });

  test("matches label names case-insensitively", () => {
    expect(deriveMetadata(["TODO", "P1"]).status).toBe("todo");
  });

  test("ignores non-reserved labels entirely", () => {
    expect(deriveMetadata(["bug", "help wanted"])).toEqual({
      status: null,
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      conflicts: [],
    });
  });
});

describe("parseTimeline", () => {
  test("keeps only labeled events with a name and timestamp", () => {
    expect(
      parseTimeline([
        { event: "labeled", label: { name: "todo" }, created_at: "2026-01-01T00:00:00Z" },
        { event: "commented", created_at: "2026-01-01T00:00:00Z" },
        { event: "labeled", label: null, created_at: "2026-01-01T00:00:00Z" },
        { event: "labeled", label: { name: "p1" } },
        { event: "labeled", label: { name: "bad" }, created_at: "not-a-date" },
        null,
      ]),
    ).toEqual([{ label: "todo", createdAt: Date.parse("2026-01-01T00:00:00Z") }]);
  });
});

describe("resolveWinners", () => {
  test("latest added label wins; the other is obsolete", () => {
    const resolution = resolveWinners(["todo", "in-progress"], [
      { label: "todo", createdAt: 100 },
      { label: "in-progress", createdAt: 200 },
    ]);
    expect(resolution.ambiguous).toBe(false);
    expect(resolution.winners.get("status")).toBe("in-progress");
    expect(resolution.obsolete).toEqual(["todo"]);
  });

  test("flags a timestamp tie as ambiguous", () => {
    const resolution = resolveWinners(["todo", "in-progress"], [
      { label: "todo", createdAt: 100 },
      { label: "in-progress", createdAt: 100 },
    ]);
    expect(resolution.ambiguous).toBe(true);
  });

  test("flags a missing timeline as ambiguous", () => {
    const resolution = resolveWinners(["todo", "in-progress"], []);
    expect(resolution.ambiguous).toBe(true);
    expect(resolution.obsolete).toEqual(["in-progress"]);
  });

  test("single-label groups are never conflicted", () => {
    expect(resolveWinners(["todo"], []).obsolete).toEqual([]);
  });
});

/** A fake installation client that records timeline calls and label deletes. */
function fakeOctokit(timeline: unknown[]) {
  const deleted: string[] = [];
  const octokit = {
    request: async (route: string, params: Record<string, unknown> = {}) => {
      if (route === "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline") {
        return { data: timeline };
      }
      if (
        route ===
        "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}"
      ) {
        deleted.push(String(params.name));
        return { data: {} };
      }
      return { data: [] };
    },
  } as unknown as InstallationOctokit;
  return { octokit, deleted };
}

describe("resolveIssueConflict", () => {
  test("removes the superseded label and recomputes metadata", async () => {
    const { octokit, deleted } = fakeOctokit([
      { event: "labeled", label: { name: "todo" }, created_at: "2026-01-01T00:00:00Z" },
      {
        event: "labeled",
        label: { name: "in-progress" },
        created_at: "2026-01-02T00:00:00Z",
      },
    ]);

    const resolved = await resolveIssueConflict(
      octokit,
      "orgA",
      "core",
      1,
      ["todo", "in-progress"],
    );

    expect(resolved.ambiguous).toBe(false);
    expect(resolved.removed).toEqual(["todo"]);
    expect(resolved.metadata.status).toBe("in-progress");
    expect(resolved.metadata.conflicts).toEqual([]);
    expect(deleted).toEqual(["todo"]);
  });

  test("leaves labels untouched when the timeline is ambiguous", async () => {
    const { octokit, deleted } = fakeOctokit([
      { event: "labeled", label: { name: "todo" }, created_at: "2026-01-01T00:00:00Z" },
      {
        event: "labeled",
        label: { name: "in-progress" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);

    const resolved = await resolveIssueConflict(
      octokit,
      "orgA",
      "core",
      1,
      ["todo", "in-progress"],
    );

    expect(resolved.ambiguous).toBe(true);
    expect(resolved.removed).toEqual([]);
    expect(deleted).toEqual([]);
  });

  test("is a no-op when there is no conflict", async () => {
    const { octokit, deleted } = fakeOctokit([]);
    const resolved = await resolveIssueConflict(octokit, "orgA", "core", 1, [
      "todo",
    ]);
    expect(resolved).toEqual({
      metadata: {
        status: "todo",
        impact: null,
        urgency: null,
        priority: null,
        size: null,
        blocked: false,
        conflicts: [],
      },
      removed: [],
      ambiguous: false,
    });
    expect(deleted).toEqual([]);
  });
});

describe("fetchTimeline", () => {
  test("paginates until a short page", async () => {
    const pages: unknown[][] = [
      Array.from({ length: 100 }, () => ({
        event: "labeled",
        label: { name: "todo" },
        created_at: "2026-01-01T00:00:00Z",
      })),
      [
        {
          event: "labeled",
          label: { name: "p1" },
          created_at: "2026-01-02T00:00:00Z",
        },
      ],
    ];
    const seenPages: number[] = [];
    const octokit = {
      request: async (
        _route: string,
        params: Record<string, unknown> = {},
      ) => {
        const page = Number(params.page ?? 1);
        seenPages.push(page);
        return { data: pages[page - 1] ?? [] };
      },
    } as unknown as InstallationOctokit;

    const events = await fetchTimeline(octokit, "orgA", "core", 1);
    expect(events).toHaveLength(101);
    expect(seenPages).toEqual([1, 2]);
  });
});
