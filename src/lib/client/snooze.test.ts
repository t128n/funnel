import { describe, expect, test } from "bun:test";
import {
  snoozeCustomDate,
  snoozeMinDate,
  snoozeNextWeek,
  snoozeTomorrow,
} from "./snooze";

const DAY_MS = 86_400_000;

describe("inbox snooze dates", () => {
  const now = new Date(2026, 10, 5, 12, 30, 0, 0);

  test("tomorrow and next week land at 09:00 local time", () => {
    const tomorrow = new Date(snoozeTomorrow(now));
    expect(tomorrow.getDate()).toBe(6);
    expect(tomorrow.getHours()).toBe(9);
    expect(tomorrow.getMinutes()).toBe(0);

    const nextWeek = new Date(snoozeNextWeek(now));
    expect(nextWeek.getDate()).toBe(12);
    expect(nextWeek.getTime() - snoozeTomorrow(now)).toBe(6 * DAY_MS);
  });

  test("a custom date resolves to 09:00 local time", () => {
    const value = snoozeCustomDate("2026-12-24");
    expect(value).not.toBeNull();
    const date = new Date(value as number);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(11);
    expect(date.getDate()).toBe(24);
    expect(date.getHours()).toBe(9);
  });

  test("rejects malformed and impossible dates", () => {
    expect(snoozeCustomDate("")).toBeNull();
    expect(snoozeCustomDate("2026-02-30")).toBeNull();
    expect(snoozeCustomDate("24/12/2026")).toBeNull();
  });

  test("the input minimum is tomorrow", () => {
    expect(snoozeMinDate(now)).toBe("2026-11-06");
  });
});
