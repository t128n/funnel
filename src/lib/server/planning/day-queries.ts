/**
 * Day-planning reads over the mirror + durable day state (SPEC §1, §3).
 *
 * Candidates are the **A**ufgaben of an ALPEN day: open, sized issues planned
 * into the ISO Monday week containing the requested date, assigned to the
 * viewer or to nobody, ordered P1 → P2 → P3 → unprioritized and then by issue
 * number. Titles hydrate a saved day without an N+1 lookup.
 */
import { and, asc, eq, isNotNull, notExists, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import {
  authAccount,
  mirrorRepo,
  mirrorThread,
  mirrorThreadAssignee,
  statePlanItem,
} from "#lib/server/db/schema";
import { assigneeExists } from "#lib/server/issues/filters";
import { issueRefKey } from "#lib/planning/availability";
import { estimateMinutes } from "#lib/server/planning/capacity";
import { weekStartOf } from "#lib/server/planning/calendar";
import { readSettings } from "#lib/server/settings/store";

/** The hard cap on a day's candidate list; the picker stays responsive. */
export const DAY_CANDIDATE_LIMIT = 50;

/** One issue identity, independent of the disposable mirror. */
export interface IssueRef {
  org: string;
  name: string;
  issueNumber: number;
}

/** A mirrored issue's display data, keyed by {@link issueRefKey}. */
export interface IssueTitle {
  title: string;
  url: string;
}

/** One issue offered to an ALPEN day. */
export interface DayCandidate extends IssueRef {
  title: string;
  /** `sm` | `md` | `lg`; always present because unsized issues are not candidates. */
  size: string;
  /** Derived `P1`–`P3`, or `null` when unprioritized. */
  priority: string | null;
  /** Minutes from `planning.size_minutes`; seeds a day block's length. */
  minutes: number;
}

export { findCalendarFeed } from "./day-store";
export type {
  CalendarFeed,
  CalendarFeedOwner,
  CalendarFeedToken,
  DayBlock,
  DayBlockInput,
  DayBlockKind,
  WindowInput,
} from "./day-store";

/**
 * The viewer's forge-native id, read synchronously from the Better Auth
 * account row. Mirrors `getViewerExternalId` without making candidate reads
 * async; returns `null` when no GitHub account is linked.
 */
function viewerExternalId(userId: string): string | null {
  const row = db
    .select({ accountId: authAccount.accountId })
    .from(authAccount)
    .where(
      and(
        eq(authAccount.userId, userId),
        eq(authAccount.providerId, "github"),
      ),
    )
    .get();
  return row?.accountId ?? null;
}

/** An issue with no assignee rows at all. */
function unassignedExists() {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(mirrorThreadAssignee)
      .where(
        and(
          eq(mirrorThreadAssignee.repoId, mirrorThread.repoId),
          eq(mirrorThreadAssignee.threadNumber, mirrorThread.number),
        ),
      ),
  );
}

/**
 * Issues that can fill the day: open, sized, planned into the Monday week of
 * `date`, and either assigned to the viewer or unassigned. Ordered by priority
 * rank then issue number, capped at {@link DAY_CANDIDATE_LIMIT}.
 */
export function listDayCandidates(
  userId: string,
  date: string,
): DayCandidate[] {
  const externalId = viewerExternalId(userId);
  const scope =
    externalId === null
      ? unassignedExists()
      : sql`(${unassignedExists()} OR ${assigneeExists([externalId])})`;

  const rows = db
    .select({
      org: mirrorRepo.org,
      name: mirrorRepo.name,
      issueNumber: mirrorThread.number,
      title: mirrorThread.title,
      size: mirrorThread.size,
      priority: mirrorThread.priority,
    })
    .from(statePlanItem)
    .innerJoin(
      mirrorRepo,
      and(
        eq(mirrorRepo.org, statePlanItem.org),
        eq(mirrorRepo.name, statePlanItem.name),
      ),
    )
    .innerJoin(
      mirrorThread,
      and(
        eq(mirrorThread.repoId, mirrorRepo.id),
        eq(mirrorThread.number, statePlanItem.issueNumber),
      ),
    )
    .where(
      and(
        eq(statePlanItem.weekStart, weekStartOf(date)),
        eq(mirrorThread.state, "open"),
        isNotNull(mirrorThread.size),
        scope,
      ),
    )
    .orderBy(
      asc(mirrorThread.priorityRank),
      asc(mirrorThread.number),
      asc(mirrorRepo.org),
      asc(mirrorRepo.name),
    )
    .limit(DAY_CANDIDATE_LIMIT)
    .all();

  const sizeMinutes = readSettings().planning.size_minutes;
  return rows.map((row) => ({
    org: row.org,
    name: row.name,
    issueNumber: row.issueNumber,
    title: row.title,
    size: row.size as string,
    priority: row.priority,
    minutes: estimateMinutes(row.size, sizeMinutes) ?? 0,
  }));
}

/**
 * Titles and URLs for a batch of refs, keyed by {@link issueRefKey}. Missing
 * refs (pruned or never mirrored) are simply absent from the map, so callers
 * keep their own fallback label.
 */
export function listIssueTitles(
  refs: readonly IssueRef[],
): Map<string, IssueTitle> {
  const titles = new Map<string, IssueTitle>();
  if (refs.length === 0) return titles;

  const tuple = sql.join(
    refs.map((ref) => sql`(${ref.org}, ${ref.name}, ${ref.issueNumber})`),
    sql`, `,
  );
  const rows = db
    .select({
      org: mirrorRepo.org,
      name: mirrorRepo.name,
      issueNumber: mirrorThread.number,
      title: mirrorThread.title,
      url: mirrorThread.url,
    })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .where(
      sql`(${mirrorRepo.org}, ${mirrorRepo.name}, ${mirrorThread.number}) IN (${tuple})`,
    )
    .all();

  for (const row of rows) {
    titles.set(issueRefKey(row.org, row.name, row.issueNumber), {
      title: row.title,
      url: row.url,
    });
  }
  return titles;
}
