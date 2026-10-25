import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { readBlocked, readEpicChildren } from "#lib/funnel-metadata";
import { db } from "#lib/server/db/index";
import {
  authAccount,
  authSession,
  authUser,
  mirrorComment,
  mirrorMilestone,
  mirrorRepo,
  mirrorThread,
  stateIntakeSubmission,
  stateIssueDelay,
  stateIssueEvent,
  stateNotification,
  statePlanItem,
  stateSetting,
  stateWorkHours,
  stateWorkNote,
} from "#lib/server/db/schema";
import { readWorkHours } from "#lib/server/planning/day-store";
import { clearSettings, readSettings } from "#lib/server/settings/store";
import { clearMirror } from "#tests/mirror-helpers";
import { DEMO_USER_ID } from "./profile";
import { DEMO_SEED_MARKER, getDemoAuth, seedDemoDatabase } from "./seed";

/** The seed instant shared by every case so relative dates are comparable. */
const NOW = Date.now();

/**
 * Wipe everything the seed owns. `auth_user` cascades sessions, accounts and
 * work hours. The App fixture from `tests/setup.ts` is deliberately untouched.
 */
function cleanup(): void {
  db.delete(stateSetting).where(eq(stateSetting.key, DEMO_SEED_MARKER)).run();
  db.delete(authUser).where(eq(authUser.id, DEMO_USER_ID)).run();
  db.delete(stateIntakeSubmission).run();
  db.delete(stateNotification).run();
  db.delete(stateWorkNote).run();
  db.delete(statePlanItem).run();
  db.delete(stateIssueEvent).run();
  db.delete(stateIssueDelay).run();
  clearMirror();
  clearSettings();
}

function count(table: SQLiteTable): number {
  const row = db.select({ n: sql<number>`count(*)` }).from(table).get();
  return Number(row?.n ?? 0);
}

function today(): string {
  return new Date(NOW).toISOString().slice(0, 10);
}

beforeEach(() => {
  cleanup();
  seedDemoDatabase({ now: NOW });
});

afterEach(() => {
  cleanup();
});

describe("seedDemoDatabase", () => {
  test("test_once", () => {
    cleanup();
    const first = seedDemoDatabase({ now: NOW });
    expect(first).toEqual({ seeded: true });
    const threads = count(mirrorThread);
    expect(threads).toBeGreaterThanOrEqual(20);

    const second = seedDemoDatabase({ now: NOW });
    expect(second).toEqual({ seeded: false });
    expect(count(mirrorThread)).toBe(threads);
    expect(count(stateSetting)).toBeGreaterThan(0);
  });

  test("test_seed_keeps_edits", () => {
    const threads = count(mirrorThread);
    db.update(mirrorThread)
      .set({ title: "Edited after the first seed" })
      .run();

    // The marker means a restart neither re-inserts rows nor overwrites edits.
    expect(seedDemoDatabase({ now: NOW + 60_000 })).toEqual({ seeded: false });

    expect(count(mirrorThread)).toBe(threads);
    const titles = db
      .select({ title: mirrorThread.title })
      .from(mirrorThread)
      .all()
      .map((row) => row.title);
    expect(titles.every((title) => title === "Edited after the first seed")).toBe(
      true,
    );
  });

  test("test_identity", () => {
    const auth = getDemoAuth();
    expect(auth).not.toBeNull();
    expect(auth!.user.role).toBe("admin");
    expect(auth!.session.expiresAt).toBeGreaterThan(NOW);
    expect(auth!.session.userId).toBe(DEMO_USER_ID);

    const account = db
      .select()
      .from(authAccount)
      .where(eq(authAccount.userId, DEMO_USER_ID))
      .get();
    expect(account?.accountId).toBe("1001");
    expect(account?.providerId).toBe("github");

    const sessions = db
      .select()
      .from(authSession)
      .where(eq(authSession.userId, DEMO_USER_ID))
      .all();
    expect(sessions).toHaveLength(1);
  });

  test("test_settings", () => {
    const settings = readSettings();
    const repos = settings.repos.map((entry) =>
      typeof entry === "string" ? { repo: entry, shortcode: undefined } : entry,
    );
    expect(repos).toEqual(
      expect.arrayContaining([
        { repo: "demo/funnel", shortcode: "FUN" },
        { repo: "demo/platform", shortcode: "PLT" },
      ]),
    );
    expect(settings.intake.default_repo).toBe("demo/funnel");
    expect(settings.planning.maintainers).toHaveLength(4);
    expect(settings.planning.maintainers.map((m) => m.login).sort()).toEqual([
      "demo",
      "jonas",
      "mira",
      "priya",
    ]);
    expect(settings.planning.maintainers.every((m) => m.active)).toBe(true);
    expect(settings.sync.history_days).toBe(90);
    expect(settings.board.done_days).toBe(14);
  });

  test("test_mirror", () => {
    expect(count(mirrorRepo)).toBe(2);
    expect(count(mirrorThread)).toBeGreaterThanOrEqual(20);

    const threads = db.select().from(mirrorThread).all();
    const statuses = new Set(threads.map((thread) => thread.status));
    for (const status of [null, "backlog", "todo", "in-progress", "in-review"]) {
      expect(statuses.has(status)).toBe(true);
    }
    expect(threads.some((thread) => thread.state === "closed")).toBe(true);

    const blocked = threads.filter((thread) => thread.blocked === 1);
    expect(blocked).toHaveLength(3);
    const rechecks = blocked.map((thread) => {
      const info = readBlocked(thread.body).info;
      expect(info?.recheck).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      return info!.recheck;
    });
    expect(rechecks.filter((date) => date < today())).toHaveLength(1);
    expect(rechecks.filter((date) => date === today())).toHaveLength(1);
    expect(rechecks.filter((date) => date > today())).toHaveLength(1);

    const epic = threads.find((thread) => thread.isEpic === 1);
    expect(epic).toBeDefined();
    const children = readEpicChildren(epic!.body);
    expect(children.length).toBeGreaterThanOrEqual(1);
    expect(children[0]).toMatch(/^demo\/funnel#\d+$/);

    expect(count(mirrorMilestone)).toBeGreaterThanOrEqual(2);

    const commentCounts = db
      .select({
        repoId: mirrorComment.repoId,
        threadNumber: mirrorComment.threadNumber,
        n: sql<number>`count(*)`,
      })
      .from(mirrorComment)
      .groupBy(mirrorComment.repoId, mirrorComment.threadNumber)
      .all();
    expect(commentCounts.some((row) => Number(row.n) >= 3)).toBe(true);
  });

  test("test_queues", () => {
    expect(count(stateIntakeSubmission)).toBeGreaterThanOrEqual(3);

    const unread = db
      .select({ n: sql<number>`count(*)` })
      .from(stateNotification)
      .where(eq(stateNotification.userId, DEMO_USER_ID))
      .get();
    expect(Number(unread?.n ?? 0)).toBeGreaterThanOrEqual(3);

    expect(count(stateWorkNote)).toBeGreaterThanOrEqual(2);
    expect(count(statePlanItem)).toBeGreaterThanOrEqual(2);
    expect(count(stateIssueEvent)).toBeGreaterThanOrEqual(1);
    expect(count(stateIssueDelay)).toBeGreaterThanOrEqual(1);

    const hours = readWorkHours(DEMO_USER_ID);
    expect(hours).not.toBeNull();
  });

  test("test_offline", () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network disabled in demo seed test");
    }) as unknown as typeof fetch;
    try {
      cleanup();
      expect(seedDemoDatabase({ now: NOW })).toEqual({ seeded: true });
    } finally {
      globalThis.fetch = original;
    }
  });

  test("test_cleanup", () => {
    expect(getDemoAuth()).not.toBeNull();
    expect(count(mirrorThread)).toBeGreaterThan(0);

    cleanup();

    expect(getDemoAuth()).toBeNull();
    expect(count(mirrorThread)).toBe(0);
    expect(count(mirrorRepo)).toBe(0);
    expect(count(stateSetting)).toBe(0);
    const workHours = db
      .select()
      .from(stateWorkHours)
      .where(eq(stateWorkHours.userId, DEMO_USER_ID))
      .all();
    expect(workHours).toHaveLength(0);
  });
});
