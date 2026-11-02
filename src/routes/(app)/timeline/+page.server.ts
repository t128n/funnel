import { milestoneTimeline } from "#lib/server/planning/timeline";
import type { PageServerLoad } from "./$types";

/**
 * `/timeline`: open milestones projected onto one date window.
 *
 * The projection is read-only and repo-scoped by an optional `repo` query
 * parameter. `repos` always comes from the unfiltered projection so the repo
 * picker does not change shape while a filter is active.
 */
export const load: PageServerLoad = async ({ url }) => {
  const repo = url.searchParams.get("repo")?.trim() || undefined;
  const all = milestoneTimeline(Date.now());
  const timeline = repo ? milestoneTimeline(Date.now(), { repo }) : all;
  return { timeline, repos: all.repos, repo: repo ?? null };
};
