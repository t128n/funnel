/**
 * Bounded bulk runner for per-item writes (issue #30).
 *
 * Each task is one existing single-item mutation path. Running a handful at a
 * time respects GitHub's secondary rate limits without introducing a batch
 * endpoint; `Promise.all` over hundreds of writes would burst the API and hide
 * which item failed.
 *
 * Results keep the input order, so a summary can name failures predictably.
 * A task that throws is recorded as a failed item rather than rejecting the
 * whole run: successful writes stay applied.
 */

/** What one task returns. Compatible with a `MutationResult` narrowed to its result. */
export type BulkTaskOutcome =
  | { ok: true }
  | { ok: false; error: string };

/** One item to write. */
export interface BulkTask {
  /** Durable item key (`issue:owner/name#123` or `submission:<id>`). */
  key: string;
  /** Performs the write. Throw to report a failure with the thrown message. */
  run: () => Promise<BulkTaskOutcome>;
}

/** The outcome for one item. */
export interface BulkItemResult {
  key: string;
  ok: boolean;
  error?: string;
}

/** The whole run, in input order plus convenience partitions. */
export interface BulkRunResult {
  results: BulkItemResult[];
  succeeded: BulkItemResult[];
  failed: BulkItemResult[];
}

export interface BulkRunOptions {
  /** Maximum writes in flight. Defaults to 3. */
  concurrency?: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}

/**
 * Run `tasks` with at most `concurrency` in flight and return a result for
 * every task, in input order. Never rejects: a thrown task becomes a failure.
 */
export async function runBulk(
  tasks: readonly BulkTask[],
  options: BulkRunOptions = {},
): Promise<BulkRunResult> {
  const requested = options.concurrency ?? 3;
  const concurrency = Number.isFinite(requested)
    ? Math.max(1, Math.floor(requested))
    : 3;

  const results: BulkItemResult[] = new Array(tasks.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= tasks.length) return;

      const task = tasks[index];
      try {
        const outcome = await task.run();
        results[index] = outcome.ok
          ? { key: task.key, ok: true }
          : { key: task.key, ok: false, error: outcome.error };
      } catch (error) {
        results[index] = { key: task.key, ok: false, error: messageOf(error) };
      }
    }
  }

  // `Promise.all` is only over the worker pool (at most `concurrency`), never
  // over the item list.
  const workers = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));

  return {
    results,
    succeeded: results.filter((result) => result.ok),
    failed: results.filter((result) => !result.ok),
  };
}
