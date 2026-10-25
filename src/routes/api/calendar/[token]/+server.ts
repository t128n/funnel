/**
 * Public tokenized ICS feed (SPEC §6).
 *
 * `GET /api/calendar/{token}.ics` needs no session: the 43-character token is
 * the capability. Unknown, revoked or rotated tokens are a bare `404`, and the
 * response is never framed as JSON so Outlook can subscribe directly.
 */
import { addDaysISO, localDateOf } from "#lib/time/zoned";
import { buildCalendar, buildFeedEvents } from "#lib/server/calendar/ics";
import {
  findCalendarFeed,
  listIssueTitles,
  type IssueRef,
} from "#lib/server/planning/day-queries";
import {
  listDayBlocks,
  listWindows,
  readWorkHours,
} from "#lib/server/planning/day-store";
import type { RequestHandler } from "./$types";

const FEED_NAME = "Funnel day plan";

/** Every successful response is inline, unindexed and privately cacheable. */
const HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Content-Disposition": 'inline; filename="funnel.ics"',
  "Cache-Control": "private, max-age=300",
  "X-Robots-Tag": "noindex, nofollow",
};

export const GET: RequestHandler = ({ params }) => {
  const owner = findCalendarFeed(params.token);
  if (!owner) return new Response("Not found", { status: 404 });

  const now = Date.now();
  const hours = readWorkHours(owner.userId);
  const timezone = hours?.timezone ?? "UTC";
  const today = localDateOf(now, timezone);
  const blocks = listDayBlocks(
    owner.userId,
    addDaysISO(today, -7),
    addDaysISO(today, 42),
  );

  const refs: IssueRef[] = [];
  for (const block of blocks) {
    if (block.kind !== "issue" || block.issueNumber === null) continue;
    refs.push({
      org: block.org ?? "",
      name: block.name ?? "",
      issueNumber: block.issueNumber,
    });
  }

  const body = buildCalendar({
    name: FEED_NAME,
    events: buildFeedEvents({
      hours,
      blocks,
      windows: listWindows(owner.userId),
      titles: listIssueTitles(refs),
      now,
    }),
  });

  return new Response(body, { status: 200, headers: HEADERS });
};
