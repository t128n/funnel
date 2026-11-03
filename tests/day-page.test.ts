/**
 * `/day` page and ALPEN component contract.
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

const page = source("src/routes/(app)/day/+page.svelte");
const dayPlan = source("src/lib/components/plan/DayPlan.svelte");

describe("day page", () => {
  test("test_day_page_renders_the_personal_view", () => {
    expect(page).toContain("DayPlan");
    expect(page).toContain("view={data.dayView}");
    expect(page).toContain("mayWrite={mayPlanDay}");
    expect(page).toContain("/settings/availability");
  });

  test("day navigation passes the date string", () => {
    expect(page).toContain("/day?day=${data.previous}");
    expect(page).toContain("/day?day=${data.next}");
    expect(page).toContain('href="/day"');
  });

  test("a read viewer can edit their own day", () => {
    // `/api/me/*` is session-only, so day editing must not be gated on the
    // workspace write role the week planner uses.
    expect(page).toContain("const mayPlanDay = $derived(data.user != null)");
    expect(page).toContain("mayWrite={mayPlanDay}");
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
