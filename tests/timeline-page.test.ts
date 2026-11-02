/**
 * `/timeline` route load and its navigation entry points.
 *
 * The projection itself has its own unit tests; this file exercises the route
 * contract — the query-parameter filter, the stable repo list, and the static
 * wiring the t128n page and sidebar depend on.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resetConfigCache, setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { stateIssueEvent } from "#lib/server/db/schema";
import {
  planningMilestone,
  resetPlanning,
  seedMilestones,
  seedPlanningIssue,
  seedPlanningRepo,
} from "#tests/planning-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { load as loadTimeline } from "#/routes/(app)/timeline/+page.server";

const REPO_A = "timeline/a";
const REPO_B = "timeline/b";
const DUE_SOON = Date.parse("2026-12-01T00:00:00Z");
const DUE_LATER = Date.parse("2027-01-15T00:00:00Z");

function url(path: string): URL {
  return new URL(`http://x${path}`);
}

function source(relative: string): string {
  return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
}

/** One open, dated milestone with one open child issue so it projects a row. */
function seedDatedMilestone(
  repo: string,
  number: number,
  title: string,
  dueOn: number,
): void {
  const repoId = seedPlanningRepo(repo);
  seedMilestones(repoId, [
    planningMilestone(number, { title, dueOn, openIssues: 1 }),
  ]);
  seedPlanningIssue({
    repoId,
    number: number * 10,
    title: `${title} child`,
    milestoneNumber: number,
  });
}

beforeEach(() => {
  resetPlanning();
  db.delete(stateIssueEvent).run();
  setConfig({ ...TEST_CONFIG });
});

afterEach(() => {
  resetPlanning();
  db.delete(stateIssueEvent).run();
  resetConfigCache();
});

describe("timeline load", () => {
  test("test_timeline_load_shape", async () => {
    seedDatedMilestone(REPO_B, 2, "Later", DUE_LATER);
    seedDatedMilestone(REPO_A, 1, "Sooner", DUE_SOON);

    const data = await loadTimeline({ url: url("/timeline") } as never);

    expect(data.repo).toBeNull();
    expect(data.timeline.rows.length).toBe(2);
    expect(data.timeline.rows[0]?.repo).toBe(REPO_A);
    expect(data.timeline.rows[0]?.dueOn).toBe(DUE_SOON);
    expect(data.timeline.rows[0]?.openIssues).toBe(1);
    expect(data.timeline.window).not.toBeNull();
    expect(data.timeline.now).toBeGreaterThan(0);
    expect([...data.repos].sort()).toEqual([REPO_A, REPO_B]);
    expect(data.repos).toEqual(data.timeline.repos);
  });

  test("test_repo_filter_narrows_rows_but_not_repos", async () => {
    seedDatedMilestone(REPO_A, 1, "Sooner", DUE_SOON);
    seedDatedMilestone(REPO_B, 2, "Later", DUE_LATER);

    const data = await loadTimeline({
      url: url(`/timeline?repo=${encodeURIComponent(REPO_A)}`),
    } as never);

    expect(data.repo).toBe(REPO_A);
    expect(data.timeline.rows.length).toBe(1);
    expect(data.timeline.rows.every((row) => row.repo === REPO_A)).toBe(true);
    expect([...data.repos].sort()).toEqual([REPO_A, REPO_B]);
  });

  test("test_unknown_repo_is_empty_but_repos_are_stable", async () => {
    seedDatedMilestone(REPO_A, 1, "Sooner", DUE_SOON);
    seedDatedMilestone(REPO_B, 2, "Later", DUE_LATER);

    const data = await loadTimeline({
      url: url("/timeline?repo=ghost%2Fmissing"),
    } as never);

    expect(data.repo).toBe("ghost/missing");
    expect(data.timeline.rows).toEqual([]);
    expect(data.timeline.undated).toEqual([]);
    expect(data.timeline.window).toBeNull();
    expect([...data.repos].sort()).toEqual([REPO_A, REPO_B]);
  });

  test("test_blank_repo_treated_as_unfiltered", async () => {
    seedDatedMilestone(REPO_A, 1, "Sooner", DUE_SOON);

    const data = await loadTimeline({ url: url("/timeline?repo=%20") } as never);

    expect(data.repo).toBeNull();
    expect(data.timeline.rows.length).toBe(1);
  });
});

describe("timeline page and navigation", () => {
  test("test_page_uses_the_t128n_shell_and_echarts_chart", () => {
    const page = source("src/routes/(app)/timeline/+page.svelte");
    const load = source("src/routes/(app)/timeline/+page.server.ts");

    expect(page).toContain("import PageHeader");
    expect(page).toContain("import Toolbar");
    expect(page).toContain("import TimelineChart");
    expect(page).toContain("import { Button }");
    expect(page).toContain("undated={data.timeline.undated}");
    expect(page).toContain("window={data.timeline.window}");
    expect(page).toContain("repoShortcodes={data.repoShortcodes}");
    expect(page).toContain("reset: false");
    expect(load).toContain(
      'import { milestoneTimeline } from "#lib/server/planning/timeline";',
    );
  });

  test("test_sidebar_and_milestones_link_timeline", () => {
    const sidebar = source("src/lib/components/shell/SidebarNav.svelte");
    expect(sidebar).toContain(
      'import ChartGanttIcon from "@lucide/svelte/icons/chart-gantt";',
    );
    expect(sidebar).toContain(
      '{ href: "/timeline", label: "Timeline", active: path.startsWith("/timeline"), icon: ChartGanttIcon }',
    );

    const milestones = source("src/routes/(app)/milestones/+page.svelte");
    expect(milestones).toContain('href="/timeline"');
    expect(milestones).toContain("ChartGanttIcon");
  });
});
