import { describe, expect, test } from "bun:test";
import {
  appendUnique,
  laneOwners,
  mergeAuthoritativePage,
  mergeFirstPage,
  movedToAnotherLane,
  removeByKey,
} from "./feed-merge";
import {
  flattenInboxRows,
  flattenIssueRows,
  FEED_ENDPOINTS,
  feedUrl,
} from "#lib/feeds";
import type { IssueListItem, RenderedInboxEntry } from "#lib/server/issues/types";

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
    impact: null,
    urgency: null,
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

  test("an unchanged page of deep-equal clones reuses the loaded array", () => {
    const keyOf = (item: unknown) => (item as { id: string }).id;
    const loaded = [
      { id: "a", title: "A", nested: { labels: ["x", "y"] } },
      { id: "b", title: "B", nested: { labels: [] } },
      { id: "c", title: "C", nested: { labels: ["z"] } },
    ];
    // A parsed refresh has new object identities but the same content.
    const first = JSON.parse(JSON.stringify(loaded.slice(0, 2)));

    expect(first[0]).not.toBe(loaded[0]);
    expect(mergeFirstPage(loaded, first, keyOf)).toBe(loaded);
  });

  test("changed content in the prefix takes the merge path", () => {
    const keyOf = (item: unknown) => (item as { id: string }).id;
    const loaded = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
    const first = [{ id: "a", title: "A edited" }];

    const merged = mergeFirstPage(loaded, first, keyOf);
    expect(merged).not.toBe(loaded);
    expect(merged).toEqual([{ id: "a", title: "A edited" }, { id: "b", title: "B" }]);
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

describe("mergeAuthoritativePage", () => {
  interface Row {
    id: string;
    title?: string;
  }
  const keyOf = (item: Row) => item.id;

  test("a complete page drops rows that left the window", () => {
    // A board card moved to another status is absent from this lane's first
    // page; the lane total shrank, so the loaded copy must go too.
    const loaded: Row[] = [{ id: "a" }, { id: "b" }, { id: "moved" }];
    const merged = mergeAuthoritativePage(
      loaded,
      { items: [{ id: "a" }, { id: "b" }], total: 2, nextCursor: null },
      keyOf,
    );
    expect(merged).toEqual([{ id: "a" }, { id: "b" }]);
  });

  test("an unchanged complete page reuses the loaded window", () => {
    const loaded: Row[] = [{ id: "a" }, { id: "b" }];
    const items = JSON.parse(JSON.stringify(loaded)) as Row[];
    expect(
      mergeAuthoritativePage(loaded, { items, total: 2, nextCursor: null }, keyOf),
    ).toBe(loaded);
  });

  test("a moved card leaves the source lane and appears once in the destination", () => {
    const source = mergeAuthoritativePage(
      [{ id: "fun7" }, { id: "fun3" }, { id: "fun14" }],
      { items: [{ id: "fun3" }, { id: "fun14" }], total: 2, nextCursor: null },
      keyOf,
    );
    const destination = mergeAuthoritativePage(
      [{ id: "fun5" }],
      {
        items: [{ id: "fun7" }, { id: "fun5" }],
        total: 2,
        nextCursor: null,
      },
      keyOf,
    );

    expect(source.map((row) => row.id)).toEqual(["fun3", "fun14"]);
    expect(destination.map((row) => row.id)).toEqual(["fun7", "fun5"]);
    expect([...source, ...destination].filter((row) => row.id === "fun7")).toHaveLength(1);
  });

  test("a page with more rows drops a stale tail even when it grew", () => {
    const loaded: Row[] = [{ id: "a" }, { id: "moved" }];
    const merged = mergeAuthoritativePage(
      loaded,
      { items: [{ id: "a" }, { id: "b" }], total: 2, nextCursor: null },
      keyOf,
    );
    expect(merged).toEqual([{ id: "a" }, { id: "b" }]);
  });

  test("a paged page keeps the loaded tail", () => {
    const loaded: Row[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const merged = mergeAuthoritativePage(
      loaded,
      {
        items: [{ id: "a", title: "updated" }, { id: "b" }],
        total: 10,
        nextCursor: "next",
      },
      keyOf,
    );
    expect(merged).toEqual([
      { id: "a", title: "updated" },
      { id: "b" },
      { id: "c" },
    ]);
  });

  test("a paged page caps the window at the server total", () => {
    const loaded: Row[] = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const merged = mergeAuthoritativePage(
      loaded,
      { items: [{ id: "a" }, { id: "b" }], total: 3, nextCursor: "next" },
      keyOf,
    );
    expect(merged).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });
});

describe("lane ownership", () => {
  interface Row {
    id: string;
  }
  const keyOf = (item: Row) => item.id;
  const owners = laneOwners<Row>(
    [
      { key: "todo", items: [{ id: "fun3" }, { id: "fun14" }] },
      { key: "in-review", items: [{ id: "fun7" }] },
    ],
    keyOf,
  );

  test("maps every authoritative row to its lane", () => {
    expect(owners.get("fun7")).toBe("in-review");
    expect(owners.get("fun3")).toBe("todo");
  });

  test("detects a row whose authoritative lane changed", () => {
    // The source lane still renders its old loaded copy; the destination page
    // proves it moved, so the source must drop it.
    expect(movedToAnotherLane("fun7", "todo", owners)).toBe(true);
    expect(movedToAnotherLane("fun7", "in-review", owners)).toBe(false);
    // Rows beyond the first page are not claimed by any lane: keep them.
    expect(movedToAnotherLane("fun99", "todo", owners)).toBe(false);
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

describe("removeByKey", () => {
  const keyOf = (item: unknown) => (item as { id: string }).id;

  test("drops a deleted row without reordering the others", () => {
    expect(removeByKey([{ id: "a" }, { id: "b" }, { id: "c" }], keyOf, "b")).toEqual([
      { id: "a" },
      { id: "c" },
    ]);
  });

  test("returns the loaded rows when the key is absent", () => {
    const loaded = [{ id: "a" }];
    expect(removeByKey(loaded, keyOf, "missing")).toBe(loaded);
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
