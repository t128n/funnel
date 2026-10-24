import { error } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";
import { readEpicChildren } from "#lib/funnel-metadata";
import type { EpicCandidate } from "#lib/components/epics/epic-actions";
import { getEpicDetail } from "#lib/server/epics/queries";
import { db } from "#lib/server/db/index";
import { mirrorRepo, mirrorThread } from "#lib/server/db/schema";
import type { PageServerLoad } from "./$types";

function refKey(org: string, name: string, number: number): string {
  return `${org.toLowerCase()}/${name.toLowerCase()}#${number}`;
}

/**
 * One epic plus the open issues a writer can still add. Children are claimed by
 * the body's `epic.children` scalar across every epic, so a candidate that
 * already belongs to this or another epic is omitted; epics themselves are
 * never candidates because nesting is rejected.
 */
export const load: PageServerLoad = async ({ params }) => {
  const number = Number(params.number);
  if (!Number.isInteger(number) || number <= 0) {
    error(404, "Epic not found");
  }

  const epic = await getEpicDetail({
    owner: params.owner,
    name: params.repo,
    number,
  });
  if (!epic) error(404, "Epic not found");

  const claimed = new Set<string>();
  const epicRows = db
    .select({
      org: mirrorRepo.org,
      name: mirrorRepo.name,
      number: mirrorThread.number,
      body: mirrorThread.body,
    })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .where(eq(mirrorThread.isEpic, 1))
    .all();
  for (const row of epicRows) {
    const refs = readEpicChildren(row.body, {
      owner: row.org,
      name: row.name,
      number: row.number,
    });
    for (const ref of refs) {
      const match = /^([^/#]+)\/([^#]+)#(\d+)$/.exec(ref);
      if (match) claimed.add(refKey(match[1], match[2], Number(match[3])));
    }
  }

  const candidates: EpicCandidate[] = db
    .select({
      org: mirrorRepo.org,
      name: mirrorRepo.name,
      number: mirrorThread.number,
      title: mirrorThread.title,
      isEpic: mirrorThread.isEpic,
    })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .where(eq(mirrorThread.state, "open"))
    .orderBy(asc(mirrorRepo.org), asc(mirrorRepo.name), asc(mirrorThread.number))
    .all()
    .filter(
      (row) =>
        row.isEpic !== 1 &&
        !claimed.has(refKey(row.org, row.name, row.number)),
    )
    .map((row) => ({
      ref: `${row.org}/${row.name}#${row.number}`,
      repo: `${row.org}/${row.name}`,
      number: row.number,
      title: row.title,
    }));

  return { epic, candidates };
};
