import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetConfigCache, setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  stateIntakeSubmission,
  stateIssueWaiting,
  stateSnooze,
  stateTriageEvent,
} from "#lib/server/db/schema";
import { snoozeSubmission } from "#lib/server/snooze";
import {
  upsertIssue,
  upsertRepo,
  type IssueRecord,
} from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { loadInsights } from "./load";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-11-05T12:00:00Z");
const REPO_A = "orgA/core";
const REPO_B = "orgA/web";

function at(iso: string): number {
  return Date.parse(iso);
}

function seedRepo(org: string, name: string, externalId: string): number {
  return upsertRepo({
    externalId,
    forge: "github",
    instance: "github.com",
    org,
    name,
    url: `https://github.com/${org}/${name}`,
    archived: false,
  }).id;
}

function seedSubmission(
  id: string,
  createdAt: number,
  archivedAt: number | null = null,
): void {
  db.insert(stateIntakeSubmission)
    .values({
      id,
      title: id,
      body: "",
      source: null,
      createdAt,
      archivedAt,
    })
    .run();
}

function seedEvent(
  id: string,
  submissionId: string,
  action: string,
  createdAt: number,
  repo: string | null = null,
): void {
  db.insert(stateTriageEvent)
    .values({
      id,
      submissionId,
      action,
      actorUserId: "user-1",
      repo,
      number: null,
      reason: null,
      createdAt,
    })
    .run();
}

function seedIssue(
  repoId: number,
  number: number,
  options: {
    createdAt: number;
    closedAt?: number | null;
    state?: string;
    status?: string | null;
  },
): void {
  const record: IssueRecord = {
    externalId: `${repoId}-${number}`,
    repoId,
    number,
    kind: "issue",
    title: `Issue ${number}`,
    body: "",
    state: options.state ?? "open",
    stateReason: null,
    author: null,
    milestoneNumber: null,
    url: "",
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
    closedAt: options.closedAt ?? null,
    labels: [],
    assignees: [],
    comments: [],
  };
  upsertIssue(record, {
    status: options.status ?? null,
    impact: null,
    urgency: null,
    priority: null,
    size: null,
    blocked: false,
    labelConflict: false,
  });
}

function seedWaiting(
  repo: string,
  number: number,
  waitingSince: number,
): void {
  db.insert(stateIssueWaiting)
    .values({
      repo,
      number,
      reason: "waiting-on-reporter",
      note: null,
      waitingSince,
      recheckOn: null,
      actorUserId: null,
    })
    .run();
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

describe("insights loader", () => {
  test("an empty database returns valid empty metrics", async () => {
    const metrics = await loadInsights({
      from: "2026-11-01",
      to: "2026-11-05",
      now: NOW,
    });
    expect(metrics.repo).toBeNull();
    expect(metrics.range.fallback).toBe(false);
    expect(metrics.inbox).toEqual({
      count: 0,
      medianMs: null,
      p90Ms: null,
      oldestDays: null,
      oldestMs: null,
    });
    expect(metrics.firstTriage.medianMs).toBeNull();
    expect(metrics.timeToClose.medianMs).toBeNull();
    expect(metrics.wip).toEqual({
      total: 0,
      byStatus: { "in-progress": 0, "in-review": 0 },
    });
    expect(metrics.stale.count).toBe(0);
    expect(metrics.backlog.total).toBe(0);
    expect(metrics.throughput.days).toHaveLength(5);
    expect(metrics.throughput.totalDecisions).toBe(0);
    expect(metrics.throughput.totalClosed).toBe(0);
  });

  test("an unknown repo yields empty metrics, not an error", async () => {
    const metrics = await loadInsights({
      repo: "ghost/missing",
      from: "2026-11-01",
      to: "2026-11-05",
      now: NOW,
    });
    expect(metrics.repo).toBe("ghost/missing");
    expect(metrics.inbox.count).toBe(0);
    expect(metrics.throughput.days).toHaveLength(5);
    expect(metrics.throughput.totalClosed).toBe(0);
  });

  test("pending inbox excludes archived and snoozed submissions", async () => {
    seedSubmission("pending-old", NOW - 5 * DAY_MS);
    seedSubmission("pending-new", NOW - 1 * DAY_MS);
    seedSubmission("archived", NOW - 20 * DAY_MS, NOW - 2 * DAY_MS);
    seedSubmission("snoozed", NOW - 30 * DAY_MS);
    snoozeSubmission("snoozed", NOW + DAY_MS, null, NOW);

    const metrics = await loadInsights({
      from: "2026-11-01",
      to: "2026-11-05",
      now: NOW,
    });
    expect(metrics.inbox.count).toBe(2);
    expect(metrics.inbox.oldestDays).toBe(5);
    expect(metrics.inbox.medianMs).toBe(3 * DAY_MS);
  });

  test("first triage is scoped by the decision repo and ignores undone", async () => {
    seedSubmission("sub-a", at("2026-11-01T00:00:00Z"));
    seedSubmission("sub-b", at("2026-11-01T00:00:00Z"));
    seedEvent("e1", "sub-a", "accepted", at("2026-11-02T00:00:00Z"), REPO_A);
    seedEvent("e2", "sub-b", "dismissed", at("2026-11-03T00:00:00Z"), null);
    seedEvent("e3", "sub-b", "undone", at("2026-11-04T00:00:00Z"), null);

    const all = await loadInsights({
      from: "2026-11-01",
      to: "2026-11-05",
      now: NOW,
    });
    expect(all.firstTriage.count).toBe(2);

    const scoped = await loadInsights({
      repo: REPO_A,
      from: "2026-11-01",
      to: "2026-11-05",
      now: NOW,
    });
    expect(scoped.firstTriage.count).toBe(1);
    expect(scoped.firstTriage.medianMs).toBe(DAY_MS);
  });

  test("throughput filters by repo and UTC day", async () => {
    const repoA = seedRepo("orgA", "core", "1");
    const repoB = seedRepo("orgA", "web", "2");
    seedSubmission("sub-a", at("2026-11-01T00:00:00Z"));
    seedEvent("e1", "sub-a", "accepted", at("2026-11-02T01:00:00Z"), REPO_A);
    seedEvent("e2", "sub-a", "duplicated", at("2026-11-02T02:00:00Z"), REPO_B);
    seedIssue(repoA, 1, {
      createdAt: at("2026-10-01T00:00:00Z"),
      closedAt: at("2026-11-03T12:00:00Z"),
      state: "closed",
    });
    seedIssue(repoB, 2, {
      createdAt: at("2026-10-01T00:00:00Z"),
      closedAt: at("2026-11-03T13:00:00Z"),
      state: "closed",
    });
    seedIssue(repoA, 3, {
      createdAt: at("2026-10-01T00:00:00Z"),
      closedAt: at("2026-11-09T13:00:00Z"),
      state: "closed",
    });

    const metrics = await loadInsights({
      repo: REPO_A,
      from: "2026-11-01",
      to: "2026-11-05",
      now: NOW,
    });
    expect(metrics.throughput.totalDecisions).toBe(1);
    expect(metrics.throughput.totalClosed).toBe(1);
    expect(metrics.throughput.days[1]).toEqual({
      date: "2026-11-02",
      decisions: 1,
      closed: 0,
    });
    expect(metrics.throughput.days[2]).toEqual({
      date: "2026-11-03",
      decisions: 0,
      closed: 1,
    });
  });

  test("WIP and backlog include only open issues in the selected repo", async () => {
    const repoA = seedRepo("orgA", "core", "1");
    const repoB = seedRepo("orgA", "web", "2");
    seedIssue(repoA, 1, {
      createdAt: NOW - 2 * DAY_MS,
      status: "in-progress",
    });
    seedIssue(repoA, 2, {
      createdAt: NOW - 10 * DAY_MS,
      status: "backlog",
    });
    seedIssue(repoA, 3, {
      createdAt: NOW - 40 * DAY_MS,
      status: null,
    });
    seedIssue(repoA, 4, {
      createdAt: NOW - 5 * DAY_MS,
      status: "in-review",
      state: "closed",
      closedAt: NOW - DAY_MS,
    });
    seedIssue(repoB, 5, {
      createdAt: NOW - 2 * DAY_MS,
      status: "in-progress",
    });

    const metrics = await loadInsights({
      repo: REPO_A,
      from: "2026-11-01",
      to: "2026-11-05",
      now: NOW,
    });
    expect(metrics.wip).toEqual({
      total: 1,
      byStatus: { "in-progress": 1, "in-review": 0 },
    });
    expect(metrics.backlog.buckets.map((bucket) => bucket.count)).toEqual([
      0, 1, 1, 0,
    ]);
    expect(metrics.backlog.total).toBe(2);
  });

  test("stale waiting counts only open issues and respects the repo filter", async () => {
    const now = new Date(2026, 0, 15, 12, 0, 0).getTime();
    const repoA = seedRepo("orgA", "core", "1");
    const repoB = seedRepo("orgA", "web", "2");
    seedIssue(repoA, 1, { createdAt: at("2025-01-01T00:00:00Z") });
    seedIssue(repoA, 2, {
      createdAt: at("2025-01-01T00:00:00Z"),
      state: "closed",
      closedAt: now - DAY_MS,
    });
    seedIssue(repoB, 3, { createdAt: at("2025-01-01T00:00:00Z") });
    seedWaiting(REPO_A, 1, now - 10 * DAY_MS);
    seedWaiting(REPO_A, 2, now - 10 * DAY_MS);
    seedWaiting(REPO_B, 3, now - 10 * DAY_MS);

    const metrics = await loadInsights({
      repo: REPO_A,
      from: "2026-01-01",
      to: "2026-01-15",
      now,
    });
    expect(metrics.stale.count).toBe(1);
    expect(metrics.wip.total).toBe(0);
  });

  test("stale waiting follows attention.waiting_days", async () => {
    const now = new Date(2026, 0, 15, 12, 0, 0).getTime();
    const repoA = seedRepo("orgA", "core", "1");
    seedIssue(repoA, 1, { createdAt: at("2025-01-01T00:00:00Z") });
    seedWaiting(REPO_A, 1, now - 5 * DAY_MS);

    setConfig({
      ...TEST_CONFIG,
      repos: [{ repo: REPO_A, shortcode: "CORE" }],
      attention: { ...TEST_CONFIG.attention, waiting_days: 3 },
    });

    const metrics = await loadInsights({
      repo: REPO_A,
      from: "2026-01-01",
      to: "2026-01-15",
      now,
    });
    expect(metrics.stale).toEqual({ count: 1, thresholdDays: 3 });
  });
});
