import { describe, expect, test } from "bun:test";
import {
  escapeHtml,
  formatAxisMonth,
  formatAxisMonthYear,
  formatDay,
  formatMonth,
  formatMonthYear,
  formatPercent,
  isAfterDue,
  isOverdue,
  progressText,
  timelineRef,
  utcDay,
} from "./timeline-format";

const DAY = 86_400_000;

describe("timeline formatting", () => {
  test("formats UTC calendar days", () => {
    expect(formatDay(Date.UTC(2026, 10, 23))).toBe("23 Nov 2026");
    expect(formatDay(null)).toBe("—");
    expect(utcDay(Date.UTC(2026, 10, 23, 23, 59))).toBe(Date.UTC(2026, 10, 23));
  });

  test("keeps the tooltip month in UTC and the axis month in local time", () => {
    expect(formatMonth(Date.UTC(2026, 10, 23))).toBe("Nov");
    expect(formatMonthYear(Date.UTC(2026, 10, 23))).toBe("Nov 2026");
    // ECharts places time-axis ticks on local month boundaries.
    expect(formatAxisMonth(new Date(2026, 10, 1).getTime())).toBe("Nov");
    expect(formatAxisMonthYear(new Date(2026, 0, 1).getTime())).toBe("Jan 2026");
  });

  test("clamps progress and formats the row label", () => {
    expect(formatPercent(0.204)).toBe("20%");
    expect(formatPercent(-1)).toBe("0%");
    expect(formatPercent(2)).toBe("100%");
    expect(progressText({ openIssues: 8, closedIssues: 2 })).toBe("2/10 closed");
  });

  test("overdue ignores due-today and fully closed milestones", () => {
    const now = Date.UTC(2026, 10, 2);
    expect(isOverdue({ dueOn: now - DAY, progress: 0.5 }, now)).toBe(true);
    expect(isOverdue({ dueOn: now, progress: 0.5 }, now)).toBe(false);
    expect(isOverdue({ dueOn: now - DAY, progress: 1 }, now)).toBe(false);
    expect(isOverdue({ dueOn: null, progress: 0.5 }, now)).toBe(false);
  });

  test("after-due is strictly after, never equal", () => {
    const due = Date.UTC(2026, 11, 1);
    expect(isAfterDue({ startOn: due + DAY, dueOn: due })).toBe(true);
    expect(isAfterDue({ startOn: due, dueOn: due })).toBe(false);
    expect(isAfterDue({ startOn: null, dueOn: due })).toBe(false);
  });

  test("escapes tooltip content and shortens the ref", () => {
    expect(escapeHtml('<b>"v1"</b> & co')).toBe(
      "&lt;b&gt;&quot;v1&quot;&lt;/b&gt; &amp; co",
    );
    expect(timelineRef("acme/widgets", 3, { "acme/widgets": "WGT" })).toBe("WGT#3");
    expect(timelineRef("acme/widgets", 3)).toBe("acme/widgets#3");
  });
});
