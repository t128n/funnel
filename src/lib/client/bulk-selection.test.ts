import { describe, expect, test } from "bun:test";
import {
  createBulkSelection,
  issueBulkKey,
  parseIssueBulkKey,
  parseSubmissionBulkKey,
  submissionBulkKey,
} from "./bulk-selection.svelte";

describe("bulk selection keys", () => {
  test("issues are keyed by durable repo slug and number", () => {
    const key = issueBulkKey("t128n/funnel", 30);
    expect(key).toBe("issue:t128n/funnel#30");
    expect(parseIssueBulkKey(key)).toEqual({ repo: "t128n/funnel", number: 30 });
  });

  test("submissions are keyed by staged id", () => {
    const key = submissionBulkKey("sub_123");
    expect(key).toBe("submission:sub_123");
    expect(parseSubmissionBulkKey(key)).toBe("sub_123");
  });

  test("a malformed issue key does not parse", () => {
    expect(parseIssueBulkKey("issue:t128n/funnel" as never)).toBeNull();
    expect(parseIssueBulkKey("issue:t128n/funnel#0" as never)).toBeNull();
  });
});

describe("bulk selection store", () => {
  test("toggles a row and counts it", () => {
    const selection = createBulkSelection();
    const key = issueBulkKey("orgA/core", 7);

    expect(selection.count).toBe(0);
    selection.toggle(key);
    expect(selection.has(key)).toBe(true);
    expect(selection.count).toBe(1);
    selection.toggle(key);
    expect(selection.has(key)).toBe(false);
    expect(selection.count).toBe(0);
  });

  test("select-all adds the loaded window and toggles it off", () => {
    const selection = createBulkSelection();
    const window = [
      issueBulkKey("orgA/core", 1),
      issueBulkKey("orgA/core", 2),
      submissionBulkKey("sub_1"),
    ];

    selection.toggleMany(window);
    expect(selection.keys).toEqual(window);
    expect(selection.count).toBe(3);

    selection.toggleMany(window);
    expect(selection.count).toBe(0);
  });

  test("snapshot splits issues and submissions in insertion order", () => {
    const selection = createBulkSelection();
    selection.add(issueBulkKey("orgA/core", 4));
    selection.add(submissionBulkKey("sub_9"));
    selection.add(issueBulkKey("orgB/web", 2));

    expect(selection.snapshot()).toEqual({
      keys: [
        "issue:orgA/core#4",
        "submission:sub_9",
        "issue:orgB/web#2",
      ],
      issues: [
        { repo: "orgA/core", number: 4 },
        { repo: "orgB/web", number: 2 },
      ],
      submissions: ["sub_9"],
      count: 3,
    });
  });

  test("a feed refresh does not clear the selection", () => {
    const selection = createBulkSelection();
    const key = issueBulkKey("orgA/core", 12);
    selection.toggle(key);

    // A refresh re-adds the rows it still knows about; the store never prunes.
    selection.addMany([issueBulkKey("orgA/core", 12), issueBulkKey("orgA/core", 13)]);
    expect(selection.has(key)).toBe(true);
    expect(selection.count).toBe(2);
  });

  test("removeMany keeps only failed or unrelated keys", () => {
    const selection = createBulkSelection();
    const done = issueBulkKey("orgA/core", 1);
    const failed = issueBulkKey("orgA/core", 2);
    const other = submissionBulkKey("sub_1");
    selection.addMany([done, failed, other]);

    selection.removeMany([done]);
    expect(selection.keys).toEqual([failed, other]);
  });

  test("clear empties the store", () => {
    const selection = createBulkSelection();
    selection.add(issueBulkKey("orgA/core", 1));
    selection.clear();
    expect(selection.count).toBe(0);
    expect(selection.snapshot().issues).toEqual([]);
  });
});
