import { describe, expect, test } from "bun:test";
import {
  actionableCount,
  addDaysISO,
  businessWeekEnd,
  classifyAttention,
  daysBetween,
  dedupeByValue,
  nextBusinessWeekStart,
  recheckDateLabel,
  recheckLabel,
  toISODate,
} from "./attention";

const TODAY = "2026-10-18";

function items(...rechecks: string[]) {
  return rechecks.map((recheck, i) => ({ recheck, id: i }));
}

describe("toISODate", () => {
  test("renders the local calendar date, zero-padded", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("day maths", () => {
  test("counts whole days across month and year ends", () => {
    expect(daysBetween("2026-10-18", "2026-10-25")).toBe(7);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-10-18", "2026-10-17")).toBe(-1);
  });

  test("shifts ISO dates", () => {
    expect(addDaysISO("2026-10-18", 7)).toBe("2026-10-25");
    expect(addDaysISO("2026-10-31", 1)).toBe("2026-11-01");
  });

  test("computes business-week anchors", () => {
    // 2026-10-18 is a Sunday.
    expect(nextBusinessWeekStart("2026-10-18")).toBe("2026-10-19");
    expect(businessWeekEnd("2026-10-18")).toBe("2026-10-23");
    // A Monday starts next week a full week out, and ends the current Friday.
    expect(nextBusinessWeekStart("2026-10-19")).toBe("2026-10-26");
    expect(businessWeekEnd("2026-10-19")).toBe("2026-10-23");
    // On a Friday the end of the week is that day.
    expect(businessWeekEnd("2026-10-23")).toBe("2026-10-23");
    // On a Saturday it rolls to the next Friday.
    expect(businessWeekEnd("2026-10-24")).toBe("2026-10-30");
  });
});

describe("classifyAttention", () => {
  test("buckets overdue, today and the 7-day window", () => {
    const buckets = classifyAttention(
      items("2026-10-10", "2026-10-18", "2026-10-25", "2026-10-26"),
      TODAY,
    );
    expect(buckets.overdue.map((i) => i.recheck)).toEqual(["2026-10-10"]);
    expect(buckets.today.map((i) => i.recheck)).toEqual(["2026-10-18"]);
    // Exactly +7 is in; +8 is out.
    expect(buckets.upcoming.map((i) => i.recheck)).toEqual(["2026-10-25"]);
  });

  test("drops malformed dates", () => {
    const buckets = classifyAttention(items("not-a-date", ""), TODAY);
    expect(
      buckets.overdue.length + buckets.today.length + buckets.upcoming.length,
    ).toBe(0);
  });

  test("actionable count is overdue plus today", () => {
    const buckets = classifyAttention(
      items("2026-10-01", "2026-10-18", "2026-10-20"),
      TODAY,
    );
    expect(actionableCount(buckets)).toBe(2);
  });
});

describe("recheckLabel", () => {
  test("labels today, past and future", () => {
    expect(recheckLabel("2026-10-18", TODAY)).toBe("Today");
    expect(recheckLabel("2026-10-15", TODAY)).toBe("3d overdue");
    expect(recheckLabel("2026-10-20", TODAY)).toBe("in 2d");
  });
});

describe("recheckDateLabel", () => {
  test("renders a stable absolute date", () => {
    expect(recheckDateLabel("2026-10-15")).toBe("Thu 15 Oct 2026");
    expect(recheckDateLabel("2027-01-01")).toBe("Fri 1 Jan 2027");
  });

  test("returns malformed dates unchanged", () => {
    expect(recheckDateLabel("nope")).toBe("nope");
  });
});

describe("dedupeByValue", () => {
  const options = (...values: string[]) =>
    values.map((value, i) => ({ value, label: `opt${i}` }));

  test("keeps the first entry per value and preserves order", () => {
    expect(
      dedupeByValue(options("mon", "wed", "mon", "fri")).map((o) => o.label),
    ).toEqual(["opt0", "opt1", "opt3"]);
  });

  test("handles no options and all-duplicates", () => {
    expect(dedupeByValue([])).toEqual([]);
    expect(dedupeByValue(options("mon", "mon", "mon"))).toHaveLength(1);
  });
});
