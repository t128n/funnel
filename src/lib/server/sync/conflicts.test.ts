import { describe, expect, test } from "bun:test";
import type { GitHubProvider, RepoRef } from "#lib/server/forge/providers.server";
import {
  deriveMetadata,
  fetchTimeline,
  normalizeTimeline,
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

describe("normalizeTimeline", () => {
  test("keeps normalized label events and converts timestamps", () => {
    expect(
      normalizeTimeline([
        {
          kind: "label",
          occurredAt: new Date(1000),
          detail: { type: "label", label: "todo" },
        },
        {
          kind: "comment",
          occurredAt: new Date(1500),
          detail: { type: "comment" },
        },
        {
          kind: "label",
          occurredAt: new Date(2000),
          detail: { type: "state_change", state: "open" },
        },
      ] as never),
    ).toEqual([{ label: "todo", createdAt: 1000 }]);
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

const repo: RepoRef = {
  forge: "github",
  instance: "github.com",
  owner: "acme",
  name: "widgets",
};

function labelEvent(label: string, at: number) {
  return {
    kind: "label",
    action: "labelled",
    occurredAt: new Date(at),
    detail: { type: "label", label },
  };
}

/** A fake provider that streams label events and records label removals. */
function fakeProvider(events: unknown[]) {
  const removed: string[][] = [];
  const seenRefs: unknown[] = [];
  const provider = {
    threads: {
      events: (ref: unknown) => ({
        async *[Symbol.asyncIterator]() {
          seenRefs.push(ref);
          for (const event of events) yield event;
        },
      }),
      removeLabels: async (_ref: unknown, labels: string[]) => {
        removed.push(labels);
        return [];
      },
    },
  } as unknown as GitHubProvider;
  return { provider, removed, seenRefs };
}

describe("resolveIssueConflict", () => {
  test("removes the superseded label and recomputes metadata", async () => {
    const { provider, removed, seenRefs } = fakeProvider([
      labelEvent("todo", 1000),
      labelEvent("in-progress", 2000),
    ]);

    const resolved = await resolveIssueConflict(provider, repo, 1, [
      "todo",
      "in-progress",
    ]);

    expect(resolved.ambiguous).toBe(false);
    expect(resolved.removed).toEqual(["todo"]);
    expect(resolved.metadata.status).toBe("in-progress");
    expect(resolved.metadata.conflicts).toEqual([]);
    expect(removed).toEqual([["todo"]]);
    expect(seenRefs[0]).toMatchObject({
      kind: "issue",
      number: "1",
      repo,
    });
  });

  test("removes each obsolete label with its own call", async () => {
    const { provider, removed } = fakeProvider([
      labelEvent("todo", 1000),
      labelEvent("in-progress", 2000),
      labelEvent("sev", 3000),
      labelEvent("mod", 4000),
    ]);

    const resolved = await resolveIssueConflict(provider, repo, 1, [
      "todo",
      "in-progress",
      "sev",
      "mod",
    ]);

    expect(resolved.removed).toEqual(["todo", "sev"]);
    expect(removed).toEqual([["todo"], ["sev"]]);
  });

  test("leaves labels untouched when the timeline is ambiguous", async () => {
    const { provider, removed } = fakeProvider([
      labelEvent("todo", 1000),
      labelEvent("in-progress", 1000),
    ]);

    const resolved = await resolveIssueConflict(provider, repo, 1, [
      "todo",
      "in-progress",
    ]);

    expect(resolved.ambiguous).toBe(true);
    expect(resolved.removed).toEqual([]);
    expect(removed).toEqual([]);
  });

  test("is a no-op when there is no conflict", async () => {
    const { provider, removed } = fakeProvider([]);
    const resolved = await resolveIssueConflict(provider, repo, 1, ["todo"]);
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
    expect(removed).toEqual([]);
  });
});

describe("fetchTimeline", () => {
  test("keeps normalized label events in order", async () => {
    const provider = { threads: { events: () => ({ async *[Symbol.asyncIterator]() {
      yield { kind: "label", action: "labelled", occurredAt: new Date(1000), detail: { type: "label", label: "backlog" } };
      yield { kind: "comment", action: "created", occurredAt: new Date(2000), detail: { type: "comment" } };
      yield { kind: "label", action: "labelled", occurredAt: new Date(3000), detail: { type: "label", label: "in-progress" } };
    } }) } };
    const ref = { forge: "github", instance: "github.com", repo, kind: "issue", number: "7" } as const;
    const events = await fetchTimeline(provider as never, ref as never);
    expect(events).toEqual([{ label: "backlog", createdAt: 1000 }, { label: "in-progress", createdAt: 3000 }]);
    expect(resolveWinners(["backlog", "in-progress"], events).winners.get("status")).toBe("in-progress");
  });
});
