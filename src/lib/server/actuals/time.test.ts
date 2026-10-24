import { describe, expect, test } from "bun:test";
import {
  activeIntervals,
  computeIssueTime,
  mergeIntervals,
  parseTimestamp,
  totalMinutes,
  type IssueEvent,
} from "./time";

const MINUTE = 60_000;
const m = (minutes: number): number => minutes * MINUTE;

function status(value: string | null, at: number): IssueEvent {
  return { kind: "status", fromValue: null, toValue: value, at };
}

function state(value: string, at: number): IssueEvent {
  return { kind: "state", fromValue: null, toValue: value, at };
}

/** Close an issue after a run of active status events. */
function activeRun(closeAt: number, statusValue = "in-progress"): IssueEvent[] {
  return [
    status(statusValue, 0),
    state("open", 0),
    state("closed", closeAt),
  ];
}

describe("activeIntervals", () => {
  test("counts in-progress and in-review time as one interval", () => {
    const events = [
      status("in-progress", m(0)),
      state("open", m(0)),
      status("in-review", m(60)),
      state("closed", m(120)),
    ];
    const merged = mergeIntervals(activeIntervals(events, m(200), m(120)), m(200));
    expect(merged).toEqual([{ start: m(0), end: m(120) }]);
    expect(totalMinutes(merged)).toBe(120);
  });

  test("ends the active interval at the close event", () => {
    const events = activeRun(m(90));
    expect(totalMinutes(activeIntervals(events, m(200)))).toBe(90);
  });

  test("prefers closedAt over the close event timestamp", () => {
    const events = activeRun(m(100));
    expect(totalMinutes(activeIntervals(events, m(200), m(90)))).toBe(90);
  });

  test("does not count a non-active status", () => {
    const events = [
      status("backlog", m(0)),
      state("open", m(0)),
      status("in-progress", m(30)),
      state("closed", m(90)),
    ];
    expect(totalMinutes(activeIntervals(events, m(200)))).toBe(60);
  });

  test("ends an open interval at now", () => {
    const events = [status("in-review", m(0)), state("open", m(0))];
    expect(totalMinutes(activeIntervals(events, m(45)))).toBe(45);
  });

  test("a baseline closed issue contributes no active time", () => {
    const events = [state("closed", m(10)), status("in-progress", m(10))];
    expect(activeIntervals(events, m(100), m(10))).toEqual([]);
  });

  test("never emits an interval ending before it starts", () => {
    const events = [status("in-progress", m(100)), state("closed", m(200))];
    expect(activeIntervals(events, m(300), m(50))).toEqual([]);
  });

  test("a reopen does not stretch the earlier interval to the latest close", () => {
    // A close/reopen/close cycle: only the final close may use `closedAt`.
    // Applying the latest close time to the first close would merge the idle
    // gap into the first interval and over-count by 60 minutes.
    const events = [
      status("in-progress", m(0)),
      state("open", m(0)),
      state("closed", m(60)),
      state("open", m(120)),
      state("closed", m(180)),
    ];
    expect(totalMinutes(activeIntervals(events, m(240), m(180)))).toBe(120);
  });
});

describe("mergeIntervals", () => {
  test("merges overlapping intervals", () => {
    expect(
      mergeIntervals(
        [
          { start: m(0), end: m(60) },
          { start: m(30), end: m(90) },
        ],
        m(120),
      ),
    ).toEqual([{ start: m(0), end: m(90) }]);
  });

  test("merges touching intervals and sorts by start", () => {
    expect(
      mergeIntervals(
        [
          { start: m(30), end: m(60) },
          { start: m(0), end: m(30) },
        ],
        m(120),
      ),
    ).toEqual([{ start: m(0), end: m(60) }]);
  });

  test("resolves an open interval against now", () => {
    expect(mergeIntervals([{ start: m(0), end: null }], m(45))).toEqual([
      { start: m(0), end: m(45) },
    ]);
  });

  test("drops empty and inverted intervals", () => {
    expect(
      mergeIntervals(
        [
          { start: m(10), end: m(10) },
          { start: m(20), end: m(5) },
        ],
        m(60),
      ),
    ).toEqual([]);
  });
});

describe("totalMinutes", () => {
  test("sums disjoint intervals", () => {
    expect(
      totalMinutes([
        { start: m(0), end: m(30) },
        { start: m(60), end: m(90) },
      ]),
    ).toBe(60);
  });
});

describe("computeIssueTime", () => {
  test("reports actual, estimate and variance", () => {
    const time = computeIssueTime({
      events: activeRun(m(120)),
      estimateMinutes: 240,
      closedAt: m(120),
      now: m(200),
    });
    expect(time.actualMinutes).toBe(120);
    expect(time.estimateMinutes).toBe(240);
    expect(time.varianceMinutes).toBe(-120);
  });

  test("has a null variance without an estimate", () => {
    const time = computeIssueTime({ events: activeRun(m(30)) });
    expect(time.estimateMinutes).toBeNull();
    expect(time.varianceMinutes).toBeNull();
  });

  test("unions overlapping delays and counts them", () => {
    const time = computeIssueTime({
      delays: [
        { startedAt: m(0), endedAt: m(60) },
        { startedAt: m(30), endedAt: m(90) },
      ],
      now: m(120),
    });
    expect(time.delayMinutes).toBe(90);
    expect(time.delayCount).toBe(2);
  });

  test("an open delay runs to now", () => {
    const time = computeIssueTime({
      delays: [{ startedAt: m(0), endedAt: null }],
      now: m(45),
    });
    expect(time.delayMinutes).toBe(45);
  });

  test("reports lead and cycle minutes", () => {
    const time = computeIssueTime({
      events: [
        status("in-progress", m(30)),
        state("open", 0),
        state("closed", m(120)),
      ],
      openedAt: 0,
      closedAt: m(120),
      now: m(200),
    });
    expect(time.actualMinutes).toBe(90);
    expect(time.leadMinutes).toBe(120);
    expect(time.cycleMinutes).toBe(90);
  });

  test("an open issue's lead and cycle run to now", () => {
    const time = computeIssueTime({
      events: [status("in-progress", m(20)), state("open", 0)],
      openedAt: 0,
      now: m(90),
    });
    expect(time.leadMinutes).toBe(90);
    expect(time.cycleMinutes).toBe(70);
  });

  test("defaults to zeroes without events or delays", () => {
    expect(computeIssueTime({ now: 0 })).toEqual({
      actualMinutes: 0,
      delayMinutes: 0,
      estimateMinutes: null,
      varianceMinutes: null,
      leadMinutes: 0,
      cycleMinutes: 0,
      delayCount: 0,
    });
  });
});

describe("parseTimestamp", () => {
  test("accepts unix milliseconds", () => {
    expect(parseTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  test("accepts ISO strings", () => {
    expect(parseTimestamp("2026-10-24T12:00:00.000Z")).toBe(
      Date.parse("2026-10-24T12:00:00.000Z"),
    );
  });

  test("rejects anything else", () => {
    for (const value of ["", "yesterday", null, undefined, {}, NaN, -5]) {
      expect(parseTimestamp(value)).toBeNull();
    }
  });
});
