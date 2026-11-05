import { describe, expect, test } from "bun:test";
import {
  DAY_MS,
  backlogAging,
  closeDurations,
  computeInsights,
  durationStats,
  emptyInsights,
  firstTriageDurations,
  inboxAge,
  issueKey,
  median,
  p90,
  quantile,
  rangeDays,
  resolveDateRange,
  staleWaitingCount,
  throughput,
  wip,
  type OpenIssueRow,
  type ResolvedRange,
  type SubmissionRow,
  type TriageEventRow,
} from "./metrics";

const NOW = Date.parse("2026-11-05T12:00:00Z");

function range(
  from = "2026-11-01",
  to = "2026-11-05",
  now = NOW,
): ResolvedRange {
  return resolveDateRange(from, to, now);
}

function at(iso: string): number {
  return Date.parse(iso);
}

function submission(id: string, createdAt: number): SubmissionRow {
  return { id, createdAt };
}

function event(
  submissionId: string,
  action: string,
  createdAt: number,
): TriageEventRow {
  return { submissionId, action, createdAt };
}

function openIssue(
  repo: string,
  number: number,
  status: string | null,
  createdAt: number,
): OpenIssueRow {
  return { repo, number, status, createdAt };
}

describe("range resolution", () => {
  test("defaults to the last 30 UTC calendar days including today", () => {
    const resolved = resolveDateRange(null, null, NOW);
    expect(resolved.from).toBe("2026-10-07");
    expect(resolved.to).toBe("2026-11-05");
    expect(resolved.start).toBe(at("2026-10-07T00:00:00Z"));
    expect(resolved.end).toBe(at("2026-11-06T00:00:00Z"));
    expect(resolved.fallback).toBe(false);
    expect(rangeDays(resolved)).toHaveLength(30);
  });

  test("keeps a valid explicit range and includes both boundary days", () => {
    const resolved = range("2026-11-02", "2026-11-03");
    expect(resolved.start).toBe(at("2026-11-02T00:00:00Z"));
    expect(resolved.end).toBe(at("2026-11-04T00:00:00Z"));
    expect(rangeDays(resolved)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(resolved.fallback).toBe(false);
  });

  test("missing endpoints take their default boundary", () => {
    const resolved = resolveDateRange("2026-10-01", null, NOW);
    expect(resolved.from).toBe("2026-10-01");
    expect(resolved.to).toBe("2026-11-05");
    expect(resolved.fallback).toBe(false);
  });

  test("malformed dates fall back to the default and report the request", () => {
    const resolved = resolveDateRange("2026-02-30", "2026-03-01", NOW);
    expect(resolved.from).toBe("2026-10-07");
    expect(resolved.to).toBe("2026-11-05");
    expect(resolved.fallback).toBe(true);
    expect(resolved.requested).toEqual({
      from: "2026-02-30",
      to: "2026-03-01",
    });
  });

  test("reversed ranges fall back instead of throwing", () => {
    const resolved = resolveDateRange("2026-11-05", "2026-11-01", NOW);
    expect(resolved.from).toBe("2026-10-07");
    expect(resolved.to).toBe("2026-11-05");
    expect(resolved.fallback).toBe(true);
  });

  test("a partial invalid range still reports the fallback", () => {
    const resolved = resolveDateRange("nope", null, NOW);
    expect(resolved.fallback).toBe(true);
    expect(resolved.from).toBe("2026-10-07");
  });
});

describe("percentiles", () => {
  test("empty input is null, never NaN", () => {
    expect(median([])).toBeNull();
    expect(p90([])).toBeNull();
    expect(quantile([], 0.9)).toBeNull();
    expect(durationStats([])).toEqual({
      count: 0,
      medianMs: null,
      p90Ms: null,
    });
  });

  test("one sample is its own median and p90", () => {
    expect(median([42])).toBe(42);
    expect(p90([42])).toBe(42);
    expect(durationStats([42])).toEqual({
      count: 1,
      medianMs: 42,
      p90Ms: 42,
    });
  });

  test("odd samples use the middle value", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(p90([1, 2, 3])).toBeCloseTo(2.8, 10);
  });

  test("even samples average the two middle values", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(p90([1, 2, 3, 4])).toBeCloseTo(3.7, 10);
  });

  test("negative and non-finite samples are ignored", () => {
    expect(median([-1, Number.NaN, Number.POSITIVE_INFINITY, 5])).toBe(5);
    expect(durationStats([-5, 10, Number.NaN])).toEqual({
      count: 1,
      medianMs: 10,
      p90Ms: 10,
    });
  });
});

describe("inbox age", () => {
  test("summarises pending ages with the oldest in whole days", () => {
    const stats = inboxAge(
      [
        { createdAt: NOW - 1 * DAY_MS },
        { createdAt: NOW - 3 * DAY_MS },
        { createdAt: NOW - 2 * DAY_MS },
      ],
      NOW,
    );
    expect(stats.count).toBe(3);
    expect(stats.medianMs).toBe(2 * DAY_MS);
    expect(stats.oldestDays).toBe(3);
    expect(stats.oldestMs).toBe(3 * DAY_MS);
  });

  test("an empty inbox is null and not NaN", () => {
    expect(inboxAge([], NOW)).toEqual({
      count: 0,
      medianMs: null,
      p90Ms: null,
      oldestDays: null,
      oldestMs: null,
    });
  });

  test("future and missing creation times cannot produce a negative age", () => {
    const stats = inboxAge(
      [{ createdAt: NOW + DAY_MS }, { createdAt: 0 }, { createdAt: NOW }],
      NOW,
    );
    expect(stats.count).toBe(2);
    expect(stats.oldestDays).toBe(0);
  });
});

describe("time to first triage", () => {
  const r = range();
  const submissions = [
    submission("s1", at("2026-11-01T01:00:00Z")),
    submission("s2", at("2026-11-01T02:00:00Z")),
    submission("s3", at("2026-11-01T03:00:00Z")),
  ];

  test("the earliest decision wins regardless of input order", () => {
    const stats = firstTriageDurations(
      submissions,
      [
        event("s1", "accepted", at("2026-11-03T01:00:00Z")),
        event("s1", "dismissed", at("2026-11-02T01:00:00Z")),
      ],
      r,
    );
    expect(stats.count).toBe(1);
    expect(stats.medianMs).toBe(1 * DAY_MS);
  });

  test("undone events are ignored and do not become a sample", () => {
    const stats = firstTriageDurations(
      submissions,
      [
        event("s1", "undone", at("2026-11-01T02:00:00Z")),
        event("s1", "dismissed", at("2026-11-01T05:00:00Z")),
        event("s1", "undone", at("2026-11-01T06:00:00Z")),
        event("s1", "accepted", at("2026-11-02T05:00:00Z")),
        event("s2", "undone", at("2026-11-02T06:00:00Z")),
      ],
      r,
    );
    expect(stats.count).toBe(1);
    expect(stats.medianMs).toBe(4 * 3_600_000);
  });

  test("a decision whose submission is missing is skipped", () => {
    const stats = firstTriageDurations(
      submissions,
      [event("ghost", "accepted", at("2026-11-02T00:00:00Z"))],
      r,
    );
    expect(stats.count).toBe(0);
    expect(stats.medianMs).toBeNull();
  });

  test("only a first decision inside the range counts", () => {
    const stats = firstTriageDurations(
      submissions,
      [
        // The first decision is before the window, so the later one is not a
        // "first triage" sample for s1.
        event("s1", "dismissed", at("2026-10-30T00:00:00Z")),
        event("s1", "accepted", at("2026-11-02T00:00:00Z")),
        event("s2", "accepted", at("2026-11-01T00:00:00Z")),
      ],
      r,
    );
    expect(stats.count).toBe(1);
    expect(stats.medianMs).toBe(0);
  });

  test("the start boundary is included and the exclusive end is not", () => {
    const stats = firstTriageDurations(
      [submission("start", at("2026-11-01T00:00:00Z")), submission("end", at("2026-11-05T00:00:00Z"))],
      [
        event("start", "accepted", at("2026-11-01T00:00:00Z")),
        event("end", "accepted", at("2026-11-06T00:00:00Z")),
      ],
      r,
    );
    expect(stats.count).toBe(1);
    expect(stats.medianMs).toBe(0);
  });

  test("repo scope applies to the first decision, not a later acceptance", () => {
    const stats = firstTriageDurations(
      submissions,
      [
        { ...event("s1", "dismissed", at("2026-11-02T00:00:00Z")), repo: null },
        {
          ...event("s1", "accepted", at("2026-11-03T00:00:00Z")),
          repo: "a/one",
        },
      ],
      r,
      "a/one",
    );
    expect(stats.count).toBe(0);
    expect(stats.medianMs).toBeNull();
  });
});

describe("time to close", () => {
  test("uses closed minus created for in-range closes", () => {
    const stats = closeDurations(
      [
        { createdAt: at("2026-11-01T00:00:00Z"), closedAt: at("2026-11-03T00:00:00Z") },
        { createdAt: at("2026-11-02T00:00:00Z"), closedAt: at("2026-11-02T12:00:00Z") },
      ],
      range(),
    );
    expect(stats.count).toBe(2);
    expect(stats.medianMs).toBe(1.25 * DAY_MS);
  });

  test("skips missing, invalid and out-of-range rows", () => {
    const stats = closeDurations(
      [
        { createdAt: 0, closedAt: at("2026-11-03T00:00:00Z") },
        { createdAt: at("2026-11-01T00:00:00Z"), closedAt: null },
        { createdAt: at("2026-10-01T00:00:00Z"), closedAt: at("2026-11-06T00:00:00Z") },
        { createdAt: at("2026-11-01T00:00:00Z"), closedAt: at("2026-11-01T00:00:00Z") },
      ],
      range(),
    );
    expect(stats.count).toBe(1);
    expect(stats.medianMs).toBe(0);
  });

  test("an inverted close time is clamped rather than producing a negative sample", () => {
    const stats = closeDurations(
      [
        { createdAt: at("2026-11-04T00:00:00Z"), closedAt: at("2026-11-03T00:00:00Z") },
      ],
      range(),
    );
    expect(stats.count).toBe(1);
    expect(stats.medianMs).toBe(0);
  });
});

describe("throughput", () => {
  test("zero-fills every day and counts decisions and closes", () => {
    const stats = throughput(
      [
        event("s1", "accepted", at("2026-11-02T01:00:00Z")),
        event("s2", "dismissed", at("2026-11-02T23:59:00Z")),
        event("s1", "undone", at("2026-11-03T01:00:00Z")),
        event("s3", "duplicated", at("2026-11-04T01:00:00Z")),
      ],
      [
        { createdAt: at("2026-10-01T00:00:00Z"), closedAt: at("2026-11-03T12:00:00Z") },
      ],
      range("2026-11-01", "2026-11-05"),
    );
    expect(stats.days.map((day) => day.date)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
    ]);
    expect(stats.days.map((day) => day.decisions)).toEqual([0, 2, 0, 1, 0]);
    expect(stats.days.map((day) => day.closed)).toEqual([0, 0, 1, 0, 0]);
    expect(stats.totalDecisions).toBe(3);
    expect(stats.totalClosed).toBe(1);
  });

  test("excludes events at the exclusive end boundary", () => {
    const stats = throughput(
      [event("s1", "accepted", at("2026-11-06T00:00:00Z"))],
      [{ createdAt: at("2026-10-01T00:00:00Z"), closedAt: at("2026-11-06T00:00:00Z") }],
      range(),
    );
    expect(stats.totalDecisions).toBe(0);
    expect(stats.totalClosed).toBe(0);
  });
});

describe("WIP", () => {
  test("counts only in-progress and in-review open issues", () => {
    const stats = wip([
      openIssue("a/one", 1, "in-progress", NOW),
      openIssue("a/one", 2, "in-review", NOW),
      openIssue("a/one", 3, "todo", NOW),
      openIssue("a/one", 4, null, NOW),
      openIssue("a/one", 5, "backlog", NOW),
      openIssue("a/two", 6, "in-progress", NOW),
    ]);
    expect(stats).toEqual({
      total: 3,
      byStatus: { "in-progress": 2, "in-review": 1 },
    });
  });
});

describe("stale waiting", () => {
  function localNow(): number {
    return new Date(2026, 0, 15, 12, 0, 0).getTime();
  }

  test("exactly seven days is not stale and eight is", () => {
    const now = localNow();
    const seven = new Date(2026, 0, 8, 12, 0, 0).getTime();
    const eight = new Date(2026, 0, 7, 12, 0, 0).getTime();
    const six = new Date(2026, 0, 9, 12, 0, 0).getTime();
    const open = new Set([issueKey("a/one", 1), issueKey("a/one", 2), issueKey("a/one", 3)]);
    expect(
      staleWaitingCount(
        [
          { repo: "a/one", number: 1, waitingSince: six },
          { repo: "a/one", number: 2, waitingSince: seven },
          { repo: "a/one", number: 3, waitingSince: eight },
        ],
        open,
        now,
      ),
    ).toBe(1);
  });

  test("closed or pruned issues are not counted", () => {
    const now = localNow();
    const old = new Date(2025, 0, 1, 12, 0, 0).getTime();
    expect(
      staleWaitingCount(
        [{ repo: "a/one", number: 9, waitingSince: old }],
        new Set(),
        now,
      ),
    ).toBe(0);
  });

  test("an explicit threshold overrides the seven-day default", () => {
    const now = localNow();
    const five = new Date(2026, 0, 10, 12, 0, 0).getTime();
    const open = new Set([issueKey("a/one", 1)]);
    const rows = [{ repo: "a/one", number: 1, waitingSince: five }];

    expect(staleWaitingCount(rows, open, now)).toBe(0);
    expect(staleWaitingCount(rows, open, now, 3)).toBe(1);
    expect(
      computeInsights(
        {
          pendingSubmissions: [],
          submissions: [],
          decisions: [],
          closedIssues: [],
          openIssues: [
            { repo: "a/one", number: 1, status: "todo", createdAt: now },
          ],
          waiting: rows,
        },
        range(),
        now,
        null,
        3,
      ).stale,
    ).toEqual({ count: 1, thresholdDays: 3 });
  });
});

describe("backlog aging", () => {
  test("respects the 7/8, 30/31 and 90/91 day edges", () => {
    const now = Date.parse("2026-11-05T00:00:00Z");
    const issues = [
      openIssue("a/one", 1, "backlog", now - 7 * DAY_MS),
      openIssue("a/one", 2, "todo", now - 8 * DAY_MS),
      openIssue("a/one", 3, null, now - 30 * DAY_MS),
      openIssue("a/one", 4, "backlog", now - 31 * DAY_MS),
      openIssue("a/one", 5, "todo", now - 90 * DAY_MS),
      openIssue("a/one", 6, null, now - 91 * DAY_MS),
      openIssue("a/one", 7, "in-progress", now - 5 * DAY_MS),
      openIssue("a/one", 8, "backlog", 0),
    ];
    const stats = backlogAging(issues, now);
    expect(stats.buckets.map((bucket) => bucket.count)).toEqual([1, 2, 2, 1]);
    expect(stats.total).toBe(6);
  });

  test("clamps future creation times into the first bucket", () => {
    const now = Date.parse("2026-11-05T00:00:00Z");
    const stats = backlogAging(
      [openIssue("a/one", 1, "backlog", now + 5 * DAY_MS)],
      now,
    );
    expect(stats.buckets[0].count).toBe(1);
  });
});

describe("empty metrics", () => {
  test("every count is zero and every percentile is null", () => {
    const metrics = emptyInsights(range(), NOW, "a/one");
    expect(metrics.repo).toBe("a/one");
    expect(metrics.inbox.count).toBe(0);
    expect(metrics.inbox.medianMs).toBeNull();
    expect(metrics.firstTriage.medianMs).toBeNull();
    expect(metrics.timeToClose.medianMs).toBeNull();
    expect(metrics.wip.total).toBe(0);
    expect(metrics.stale.count).toBe(0);
    expect(metrics.backlog.total).toBe(0);
    expect(metrics.throughput.days).toHaveLength(5);
    expect(metrics.throughput.totalDecisions).toBe(0);
    expect(metrics.throughput.totalClosed).toBe(0);
    expect(
      JSON.stringify(metrics).includes("NaN"),
    ).toBe(false);
  });

  test("computeInsights is just the empty case for empty input", () => {
    const metrics = computeInsights(
      {
        pendingSubmissions: [],
        submissions: [],
        decisions: [],
        closedIssues: [],
        openIssues: [],
        waiting: [],
      },
      range(),
      NOW,
    );
    expect(metrics.backlog.buckets.map((bucket) => bucket.count)).toEqual([
      0, 0, 0, 0,
    ]);
  });
});
