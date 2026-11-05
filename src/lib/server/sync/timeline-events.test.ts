import { describe, expect, test } from "bun:test";
import { HYDRATE_QUERY, normalizeTimelineItems } from "./hydrate";

const AT = "2026-02-01T10:00:00Z";
const ACTOR = { databaseId: 7, login: "octocat", avatarUrl: "https://a/7" };

function item(overrides: Record<string, unknown>): Record<string, unknown> {
  return { id: "event-1", createdAt: AT, actor: ACTOR, ...overrides };
}

describe("normalizeTimelineItems", () => {
  test("normalizes label add and remove", () => {
    const events = normalizeTimelineItems([
      item({ __typename: "LabeledEvent", label: { name: "bug" } }),
      item({ __typename: "UnlabeledEvent", label: { name: "wontfix" } }),
    ]);

    expect(events.map((event) => [event.kind, event.action])).toEqual([
      ["label", "labelled"],
      ["label", "unlabelled"],
    ]);
    expect(events[0].summary).toBe('added label "bug"');
    expect(events[0].detail).toEqual({ label: "bug" });
    expect(events[0].actor).toMatchObject({ externalId: "7", login: "octocat" });
    expect(events[1].summary).toBe('removed label "wontfix"');
  });

  test("normalizes assignments", () => {
    const events = normalizeTimelineItems([
      item({ __typename: "AssignedEvent", assignee: ACTOR }),
      item({ __typename: "UnassignedEvent", assignee: ACTOR }),
    ]);

    expect(events.map((event) => [event.kind, event.action])).toEqual([
      ["assignment", "assigned"],
      ["assignment", "unassigned"],
    ]);
    expect(events[0].summary).toBe("assigned @octocat");
    expect(events[0].detail).toEqual({ assignee: "octocat" });
    expect(events[1].summary).toBe("unassigned @octocat");
  });

  test("normalizes close and reopen", () => {
    const events = normalizeTimelineItems([
      item({ __typename: "ClosedEvent" }),
      item({ __typename: "ReopenedEvent" }),
    ]);

    expect(events.map((event) => [event.kind, event.action])).toEqual([
      ["state_change", "closed"],
      ["state_change", "reopened"],
    ]);
    expect(events.map((event) => event.summary)).toEqual([
      "closed this issue",
      "reopened this issue",
    ]);
  });

  test("normalizes cross-references with their source", () => {
    const [event] = normalizeTimelineItems([
      item({
        __typename: "CrossReferencedEvent",
        source: {
          __typename: "PullRequest",
          number: 12,
          title: "Fix it",
          url: "https://github.com/orgA/core/pull/12",
        },
      }),
    ]);

    expect(event.kind).toBe("referenced");
    expect(event.action).toBe("cross-referenced");
    expect(event.summary).toBe("cross-referenced this issue from #12");
    expect(event.detail).toEqual({
      sourceType: "PullRequest",
      sourceNumber: 12,
      sourceTitle: "Fix it",
      sourceUrl: "https://github.com/orgA/core/pull/12",
    });
  });

  test("normalizes plain references, mentions and milestones", () => {
    const events = normalizeTimelineItems([
      item({
        __typename: "ReferencedEvent",
        commit: { oid: "abcdef1234567890" },
      }),
      item({ __typename: "MentionedEvent" }),
      item({ __typename: "MilestonedEvent", milestoneTitle: "v1" }),
      item({ __typename: "DemilestonedEvent", milestoneTitle: "v1" }),
    ]);

    expect(events.map((event) => [event.kind, event.action])).toEqual([
      ["referenced", "referenced"],
      ["mention", "mentioned"],
      ["other", "added"],
      ["other", "removed"],
    ]);
    expect(events[0].summary).toBe("referenced this issue in commit abcdef1");
    expect(events[0].detail).toEqual({ reference: "abcdef1234567890" });
    expect(events[1].summary).toBe("was mentioned in a comment");
    expect(events[2].summary).toBe('added milestone "v1"');
    expect(events[3].summary).toBe('removed milestone "v1"');
  });

  test("normalizes renames with previous and current titles", () => {
    const [event] = normalizeTimelineItems([
      item({
        __typename: "RenamedTitleEvent",
        previousTitle: "Old title",
        currentTitle: "New title",
      }),
    ]);

    expect(event.kind).toBe("other");
    expect(event.action).toBe("renamed");
    expect(event.summary).toBe(
      'renamed the title from "Old title" to "New title"',
    );
    expect(event.detail).toEqual({ from: "Old title", to: "New title" });
  });

  test("skips comments, unknown types, missing ids and missing dates", () => {
    const events = normalizeTimelineItems([
      item({ __typename: "IssueComment", body: "hello" }),
      item({ __typename: "PullRequestReviewComment" }),
      item({ __typename: "UnknownFutureEvent" }),
      item({ __typename: "LabeledEvent", id: null, label: { name: "bug" } }),
      item({ __typename: "LabeledEvent", createdAt: null }),
      item({ __typename: "LabeledEvent", createdAt: "not-a-date" }),
      item({ __typename: "LabeledEvent", label: { name: "kept" } }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe('added label "kept"');
  });

  test("tolerates a missing actor", () => {
    const [event] = normalizeTimelineItems([
      item({ __typename: "ClosedEvent", actor: null }),
    ]);
    expect(event.actor).toBeNull();
    expect(event.summary).toBe("closed this issue");
  });

  test("accepts an empty timeline", () => {
    expect(normalizeTimelineItems(undefined)).toEqual([]);
    expect(normalizeTimelineItems(null)).toEqual([]);
    expect(normalizeTimelineItems([])).toEqual([]);
  });

  test("the hydration query asks for a bounded timeline window", () => {
    expect(HYDRATE_QUERY).toContain("$since: DateTime");
    expect(HYDRATE_QUERY).toContain("timelineItems(last: 50, since: $since)");
    expect(HYDRATE_QUERY).toContain("LabeledEvent");
    expect(HYDRATE_QUERY).toContain("CrossReferencedEvent");
    expect(HYDRATE_QUERY).not.toContain("IssueComment {");
  });
});
