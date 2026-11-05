/**
 * `/insights` route contract and page wiring.
 *
 * The metric arithmetic and SQL loader have their own tests. This file checks
 * the route defaults, the effective-range reporting, the unknown-repo path and
 * the labels/navigation the read-only dashboard depends on.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resetConfigCache, setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  stateIntakeSubmission,
  stateIssueWaiting,
  stateSnooze,
  stateTriageEvent,
} from "#lib/server/db/schema";
import { overflowDestination } from "#lib/components/shell/navigation";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { load as loadInsights } from "#/routes/(app)/insights/+page.server";
import { resolveDateRange } from "#lib/server/insights/metrics";

const REPO_A = "orgA/core";
const REPO_B = "orgA/web";

function url(path: string): URL {
  return new URL(`http://x${path}`);
}

function source(relative: string): string {
  return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
}

beforeEach(() => {
  clearMirror();
  db.delete(stateTriageEvent).run();
  db.delete(stateIntakeSubmission).run();
  db.delete(stateIssueWaiting).run();
  db.delete(stateSnooze).run();
  setConfig({
    ...TEST_CONFIG,
    repos: [
      { repo: REPO_A, shortcode: "CORE" },
      { repo: REPO_B, shortcode: "WEB" },
    ],
    intake: { default_repo: REPO_A },
  });
});

afterEach(() => {
  clearMirror();
  db.delete(stateTriageEvent).run();
  db.delete(stateIntakeSubmission).run();
  db.delete(stateIssueWaiting).run();
  db.delete(stateSnooze).run();
  resetConfigCache();
});

describe("insights route", () => {
  test("defaults to the last 30 UTC calendar days", async () => {
    const expected = resolveDateRange(null, null, Date.now());
    const data = await loadInsights({ url: url("/insights") } as never);
    expect(data.repo).toBeNull();
    expect(data.repoKnown).toBe(true);
    expect(data.insights.range.from).toBe(expected.from);
    expect(data.insights.range.to).toBe(expected.to);
    expect(data.insights.range.fallback).toBe(false);
    expect(data.repos).toEqual([REPO_A, REPO_B]);
  });

  test("passes explicit from/to/repo through and reports the effective range", async () => {
    const data = await loadInsights({
      url: url("/insights?repo=orgA%2Fcore&from=2026-01-02&to=2026-01-04"),
    } as never);
    expect(data.repo).toBe(REPO_A);
    expect(data.repoKnown).toBe(true);
    expect(data.insights.range.from).toBe("2026-01-02");
    expect(data.insights.range.to).toBe("2026-01-04");
    expect(data.insights.range.start).toBe(Date.parse("2026-01-02T00:00:00Z"));
    expect(data.insights.range.end).toBe(Date.parse("2026-01-05T00:00:00Z"));
    expect(data.insights.throughput.days).toHaveLength(3);
  });

  test("a malformed range falls back and still returns the page", async () => {
    const expected = resolveDateRange(null, null, Date.now());
    const data = await loadInsights({
      url: url("/insights?from=2026-02-30&to=2026-03-01"),
    } as never);
    expect(data.insights.range.fallback).toBe(true);
    expect(data.insights.range.from).toBe(expected.from);
    expect(data.insights.range.to).toBe(expected.to);
  });

  test("a reversed range falls back and still returns the page", async () => {
    const expected = resolveDateRange(null, null, Date.now());
    const data = await loadInsights({
      url: url("/insights?from=2026-03-01&to=2026-02-01"),
    } as never);
    expect(data.insights.range.fallback).toBe(true);
    expect(data.insights.range.from).toBe(expected.from);
    expect(data.insights.range.to).toBe(expected.to);
  });

  test("an unknown repo returns empty metrics and flags the picker value", async () => {
    const data = await loadInsights({
      url: url("/insights?repo=ghost%2Fmissing&from=2026-01-01&to=2026-01-02"),
    } as never);
    expect(data.repo).toBe("ghost/missing");
    expect(data.repoKnown).toBe(false);
    expect(data.insights.repo).toBe("ghost/missing");
    expect(data.insights.inbox.count).toBe(0);
    expect(data.insights.throughput.totalClosed).toBe(0);
    expect(data.insights.throughput.days).toHaveLength(2);
  });
});

describe("insights page and navigation", () => {
  test("renders the metric labels, filters and empty state", () => {
    const page = source("src/routes/(app)/insights/+page.svelte");
    for (const label of [
      "Inbox age",
      "Time to first triage",
      "Time to close",
      "Work in progress",
      "Stale waiting",
      "Throughput",
      "Backlog aging",
      "No activity in this range.",
    ]) {
      expect(page).toContain(label);
    }
    expect(page).toContain('name="repo"');
    expect(page).toContain('name="from"');
    expect(page).toContain('name="to"');
    expect(page).toContain('badge text-bg-secondary">now');
    expect(page).toContain('badge text-bg-secondary">range');
    expect(page).toContain("throughput-scroll");
    expect(page).toContain("visually-hidden");
    expect(page).not.toContain("echarts");
  });

  test("adds Insights to the overflow navigation without touching the six primary links", () => {
    const navigation = source("src/lib/components/shell/navigation.ts");
    expect(navigation).toContain("href: '/insights'");
    expect(navigation).toContain("icon: 'bi-graph-up-arrow'");
    expect(overflowDestination(url("/insights"))?.label).toBe("Insights");
    const primary = navigation.slice(
      navigation.indexOf("export const PRIMARY_NAV"),
      navigation.indexOf("export const OVERFLOW_NAV"),
    );
    expect((primary.match(/label: '/g) ?? []).length).toBe(6);
  });
});
