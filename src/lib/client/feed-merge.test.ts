import { describe, expect, mock, test } from "bun:test";
import { appendUnique, mergeFirstPage } from "./feed-merge";
import {
  flattenInboxRows,
  flattenIssueRows,
  FEED_ENDPOINTS,
  feedUrl,
} from "#lib/feeds";
import type { IssueListItem, RenderedInboxEntry } from "#lib/server/issues/types";

// The board-feed store reaches `svelte-sonner` (through the optimistic overlay);
// its precompiled components do not load under `bun test`, so stub the toasts.
mock.module("svelte-sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));

/** Minimal issue fixture; overrides supply the fields a test cares about. */
function issue(overrides: Partial<IssueListItem> & { number: number }): IssueListItem {
  return {
    repoId: 1,
    repo: "orgA/core",
    title: `Issue ${overrides.number}`,
    state: "open",
    stateReason: null,
    status: "todo",
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

function submission(id: string): RenderedInboxEntry {
  return {
    kind: "submission",
    submission: {
      id,
      title: `Submission ${id}`,
      body: "",
      bodyHtml: "",
      source: null,
      createdAt: 0,
    },
  };
}

function issueEntry(item: IssueListItem): RenderedInboxEntry {
  return { kind: "issue", issue: item };
}

const issueKey = (item: unknown): string => {
  const entry = item as IssueListItem;
  return `${entry.repoId}:${entry.number}`;
};

describe("mergeFirstPage", () => {
  test("keeps the authoritative first-page order and the retained tail", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    const a2 = { id: "a", title: "updated" };
    const keyOf = (item: unknown) => (item as { id: string }).id;

    expect(mergeFirstPage([a, b, c], [a2, b], keyOf)).toEqual([a2, b, c]);
  });

  test("deduplicates within the first page and the loaded tail", () => {
    const keyOf = (item: unknown) => (item as { id: string }).id;
    const first: Array<{ id: string; value?: number }> = [
      { id: "a", value: 1 },
      { id: "a", value: 2 },
    ];
    const loaded: Array<{ id: string; value?: number }> = [
      { id: "b" },
      { id: "b" },
      { id: "c" },
    ];

    expect(mergeFirstPage(loaded, first, keyOf)).toEqual([
      { id: "a", value: 1 },
      { id: "b" },
      { id: "c" },
    ]);
  });

  test("an empty first page retains every loaded row", () => {
    const keyOf = (item: unknown) => (item as { id: string }).id;
    expect(mergeFirstPage([{ id: "a" }], [], keyOf)).toEqual([{ id: "a" }]);
  });
});

describe("appendUnique", () => {
  test("appends unseen items and skips duplicates", () => {
    const keyOf = (item: unknown) => (item as { id: string }).id;
    expect(
      appendUnique([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }, { id: "c" }], keyOf)
    ).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  test("returns the loaded rows when the page is empty", () => {
    const keyOf = (item: unknown) => (item as { id: string }).id;
    expect(appendUnique([{ id: "a" }], [], keyOf)).toEqual([{ id: "a" }]);
  });
});

describe("flattenIssueRows", () => {
  test("renders flat item rows when grouping is off", () => {
    const x = issue({ number: 7 });
    const y = issue({ number: 8 });
    expect(flattenIssueRows([x, y], "none", {}, [], () => false)).toEqual([
      { kind: "item", key: "1:7", item: x },
      { kind: "item", key: "1:8", item: y },
    ]);
  });

  test("emits a group header followed by its items", () => {
    const x = issue({ number: 7, status: "in-progress" });
    expect(flattenIssueRows([x], "status", {}, [], () => false)).toEqual([
      { kind: "group", key: "status:in-progress", label: "In Progress", count: 1 },
      { kind: "item", key: "status:in-progress:1:7", item: x },
    ]);
  });

  test("collapsed groups emit only their header", () => {
    const x = issue({ number: 7, status: "in-progress" });
    const rows = flattenIssueRows([x], "status", {}, [], (key) => key === "status:in-progress");

    expect(rows).toEqual([
      { kind: "group", key: "status:in-progress", label: "In Progress", count: 1 },
    ]);
  });

  test("project grouping repeats an issue with distinct keys", () => {
    const projects = [
      { label: "project1", name: "Project One" },
      { label: "project2", name: "Project Two" },
    ];
    const x = issue({ number: 7, labels: ["project1", "project2"] });
    const rows = flattenIssueRows([x], "project", {}, projects, () => false);

    expect(rows).toEqual([
      { kind: "group", key: "project:project1", label: "Project One", count: 1 },
      { kind: "item", key: "project:project1:1:7", item: x },
      { kind: "group", key: "project:project2", label: "Project Two", count: 1 },
      { kind: "item", key: "project:project2:1:7", item: x },
    ]);
  });

  test("falls back to a flat list when a grouping dimension has no sections", () => {
    const x = issue({ number: 7, milestone: null });
    expect(flattenIssueRows([x], "milestone", {}, [], () => false)).toEqual([
      { kind: "item", key: "1:7", item: x },
    ]);
  });

  test("an empty projection flattens to no rows", () => {
    expect(flattenIssueRows([], "status", {}, [], () => false)).toEqual([]);
  });
});

describe("flattenInboxRows", () => {
  test("renders staged submissions first, then issue groups", () => {
    const staged = submission("s1");
    const issueRow = issueEntry(issue({ number: 7, status: "in-progress" }));
    const rows = flattenInboxRows([staged, issueRow], "status", {}, [], () => false);

    expect(rows).toEqual([
      { kind: "group", key: "inbox:submissions", label: "Staged", count: 1 },
      { kind: "item", key: "submission:s1", item: staged },
      { kind: "group", key: "status:in-progress", label: "In Progress", count: 1 },
      { kind: "item", key: "status:in-progress:1:7", item: issueRow },
    ]);
  });

  test("collapsed staged sections hide submission rows", () => {
    const staged = submission("s1");
    const rows = flattenInboxRows([staged], "none", {}, [], (key) => key === "inbox:submissions");

    expect(rows).toEqual([
      { kind: "group", key: "inbox:submissions", label: "Staged", count: 1 },
    ]);
  });

  test("renders untriaged issues flat when grouping is off", () => {
    const entry = issueEntry(issue({ number: 7, status: null }));
    expect(flattenInboxRows([entry], "none", {}, [], () => false)).toEqual([
      { kind: "item", key: "1:7", item: entry },
    ]);
  });
});

describe("feedUrl", () => {
  test("preserves filters and appends cursor and limit", () => {
    expect(
      feedUrl(FEED_ENDPOINTS.issues, new URLSearchParams("priority=p1"), "abc", undefined, 100)
    ).toBe("/api/feeds/issues?priority=p1&cursor=abc&limit=100");
  });

  test("omits a null cursor and URL-encodes every value", () => {
    const url = feedUrl(
      FEED_ENDPOINTS.board,
      new URLSearchParams("search=a b&repo=orgA/core"),
      "eyJ2Ijox+/=",
      { column: "in-progress" }
    );

    expect(url).toBe(
      "/api/feeds/board?search=a+b&repo=orgA%2Fcore&column=in-progress&cursor=eyJ2Ijox%2B%2F%3D"
    );
  });

  test("extra parameters override filter copies", () => {
    expect(
      feedUrl(FEED_ENDPOINTS.inbox, new URLSearchParams("state=open"), null, {
        state: "closed",
      })
    ).toBe("/api/feeds/inbox?state=closed");
  });

  test("strips stale cursor and limit from the incoming search", () => {
    expect(
      feedUrl(
        FEED_ENDPOINTS.inbox,
        new URLSearchParams("cursor=stale&limit=7&state=open"),
        null
      )
    ).toBe("/api/feeds/inbox?state=open");
  });

  test("a fresh cursor and limit replace the stale copies", () => {
    expect(
      feedUrl(
        FEED_ENDPOINTS.board,
        new URLSearchParams("cursor=stale&limit=7"),
        "fresh",
        { column: "todo" },
        50
      )
    ).toBe("/api/feeds/board?cursor=fresh&limit=50&column=todo");
  });
});

describe("feed module boundaries", () => {
  test("createBoardFeed is owned by board-feed.svelte only", async () => {
    const feedModule = await import("#lib/client/feed.svelte");
    const boardModule = await import("#lib/client/board-feed.svelte");

    expect("createFeed" in feedModule).toBe(true);
    expect("createBoardFeed" in feedModule).toBe(false);
    expect("createBoardFeed" in boardModule).toBe(true);
  });
});
