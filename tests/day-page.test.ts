/**
 * Day horizon and ALPEN component contract (SPEC §7, §9).
 *
 * The day load itself is covered by `planning-day-load.test.ts`; these checks
 * pin the page wiring, the five chips, the edit actions and the kill switches
 * that make a day read honestly: non-work days and manual overruns.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function source(relative: string): string {
  return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
}

const page = source("src/routes/(app)/plan/+page.svelte");
const dayPlan = source("src/lib/components/plan/DayPlan.svelte");

describe("day tab", () => {
  test("test_day_tab", () => {
    expect(page).toContain("horizonHref('day'");
    expect(page).toContain("horizon=day");
    expect(page).toContain("view={data.dayView}");
    expect(page).toContain("horizon === 'day'");
    expect(page).toContain("DayPlan");
  });

  test("day navigation passes the date string", () => {
    expect(page).toContain("params.set('day', value)");
    expect(page).toContain("horizonHref('day', previous)");
    expect(page).toContain("horizonHref('day', next)");
  });
});

describe("ALPEN component", () => {
  test("test_alpen_chips", () => {
    for (const chip of ["A", "L", "P", "E", "N"]) {
      expect(dayPlan).toContain(`data-alpen="${chip}"`);
    }
    // Aufgaben count, Länge planned, Puffer reserved, Entscheiden ordering,
    // Nachkontrolle variance.
    expect(dayPlan).toContain("view.candidates.length");
    expect(dayPlan).toContain("formatMinutes(view.plannedMinutes)");
    expect(dayPlan).toContain("formatMinutes(view.bufferMinutes)");
    expect(dayPlan).toContain("view.review.varianceMinutes");
  });

  test("test_actions", () => {
    expect(dayPlan).toContain("Auto-plan");
    expect(dayPlan).toContain("Clear day");
    expect(dayPlan).toContain("Add");
    expect(dayPlan).toContain("Remove");
    expect(dayPlan).toContain("/settings/availability");
    expect(dayPlan).toContain("saveDayRequest");
    expect(dayPlan).toContain("autoPlanRequest");
    expect(dayPlan).toContain("invalidateAll");
  });

  test("renders an hour grid and positioned blocks", () => {
    expect(dayPlan).toContain("view.startMinute");
    expect(dayPlan).toContain("view.endMinute");
    expect(dayPlan).toContain("formatClock");
    expect(dayPlan).toContain("block.startMinute");
    expect(dayPlan).toContain("block.minutes");
    expect(dayPlan).toContain("formatMinutes(block.minutes)");
  });

  test("flags a non-work day and an overrun", () => {
    expect(dayPlan).toContain("view.availableMinutes === 0");
    expect(dayPlan).toContain("Not a work day");
    expect(dayPlan).toContain("Overbooked");
    expect(dayPlan).toContain("outside working hours");
  });

  test("renders planned-versus-actual review rows", () => {
    expect(dayPlan).toContain("view.review.rows");
    expect(dayPlan).toContain("actualMinutes");
    expect(dayPlan).toContain("varianceMinutes");
  });
});
