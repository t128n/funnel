import { describe, expect, test } from "bun:test";
import { inboxActionUrl, inboxEmptyState, inboxSummary } from "./inbox";

describe("inboxEmptyState", () => {
  test("reports clear only when the underlying queue is empty", () => {
    expect(inboxEmptyState(0)).toBe("clear");
  });

  test("reports a no-match view when the queue still has items", () => {
    expect(inboxEmptyState(2)).toBe("no-match");
  });
});

describe("inboxSummary", () => {
  test("shows the queue breakdown when nothing is filtered", () => {
    expect(
      inboxSummary({
        submissions: 4,
        untriaged: 2,
        matching: 6,
        queueTotal: 6,
        filtered: false,
      })
    ).toBe("4 submissions · 2 untriaged issues");
  });

  test("labels a filtered view against the full queue instead of claiming it is empty", () => {
    expect(
      inboxSummary({
        submissions: 0,
        untriaged: 0,
        matching: 0,
        queueTotal: 6,
        filtered: true,
      })
    ).toBe("Showing 0 of 6 queued items · filtered");
  });

  test("pluralizes a single queued item", () => {
    expect(
      inboxSummary({
        submissions: 1,
        untriaged: 0,
        matching: 1,
        queueTotal: 1,
        filtered: true,
      })
    ).toBe("Showing 1 of 1 queued item · filtered");
  });
});

describe("inboxActionUrl", () => {
  test("posts to the inbox route with the action name", () => {
    expect(inboxActionUrl("", "accept")).toBe("?/accept");
    expect(inboxActionUrl("?", "dismiss")).toBe("?/dismiss");
  });

  test("preserves the active search for a no-JS post", () => {
    expect(inboxActionUrl("?q=zzzz", "accept")).toBe("?q=zzzz&/accept");
  });

  test("keeps the action parameter first so SvelteKit recognises it", () => {
    const url = new URL(inboxActionUrl("?q=zzzz", "dismiss"), "http://x/inbox");
    expect([...url.searchParams.keys()]).toContain("/dismiss");
  });
});
