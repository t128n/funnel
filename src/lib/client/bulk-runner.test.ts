import { describe, expect, test } from "bun:test";
import { runBulk, type BulkTask } from "./bulk-runner";

function task(
  key: string,
  run: () => Promise<{ ok: true } | { ok: false; error: string }>,
): BulkTask {
  return { key, run };
}

describe("runBulk", () => {
  test("returns a result per item in input order", async () => {
    const result = await runBulk([
      task("issue:a#1", async () => ({ ok: true })),
      task("issue:a#2", async () => ({ ok: true })),
      task("issue:a#3", async () => ({ ok: true })),
    ]);

    expect(result.results.map((row) => row.key)).toEqual([
      "issue:a#1",
      "issue:a#2",
      "issue:a#3",
    ]);
    expect(result.failed).toEqual([]);
    expect(result.succeeded).toHaveLength(3);
  });

  test("keeps successful writes and reports each partial failure", async () => {
    const result = await runBulk([
      task("issue:a#1", async () => ({ ok: true })),
      task("issue:a#2", async () => ({ ok: false, error: "GitHub said no" })),
      task("issue:a#3", async () => ({ ok: true })),
    ]);

    expect(result.succeeded.map((row) => row.key)).toEqual([
      "issue:a#1",
      "issue:a#3",
    ]);
    expect(result.failed).toEqual([
      { key: "issue:a#2", ok: false, error: "GitHub said no" },
    ]);
  });

  test("turns a thrown task into a failed item", async () => {
    const result = await runBulk([
      task("submission:one", async () => {
        throw new Error("network down");
      }),
    ]);

    expect(result.failed).toEqual([
      { key: "submission:one", ok: false, error: "network down" },
    ]);
  });

  test("never runs more than the concurrency limit", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let peak = 0;

    const tasks = Array.from({ length: 9 }, (_, index) =>
      task(`issue:a#${index + 1}`, async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate;
        active -= 1;
        return { ok: true as const };
      }),
    );

    const running = runBulk(tasks, { concurrency: 3 });
    // Let the worker pool reach its steady state before releasing it.
    await Promise.resolve();
    await Promise.resolve();
    expect(peak).toBe(3);

    release();
    const result = await running;
    expect(result.succeeded).toHaveLength(9);
    expect(peak).toBeLessThanOrEqual(3);
  });

  test("clamps a bad concurrency value and handles an empty list", async () => {
    const empty = await runBulk([], { concurrency: 0 });
    expect(empty).toEqual({ results: [], succeeded: [], failed: [] });

    const one = await runBulk(
      [
        task("issue:a#1", async () => ({ ok: true })),
        task("issue:a#2", async () => ({ ok: true })),
      ],
      { concurrency: 0 },
    );
    expect(one.succeeded).toHaveLength(2);
  });
});
