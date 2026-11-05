import { configuredRepoSlugs, getConfig } from "#lib/server/config";
import { loadInsights } from "#lib/server/insights/load";
import type { PageServerLoad } from "./$types";

/**
 * `/insights`: a read-only triage analytics snapshot.
 *
 * The repo and date filters live entirely in the URL. Invalid or reversed date
 * pairs are reported in `insights.range` and fall back to the last 30 calendar
 * days rather than failing the request. The repo picker always lists every
 * configured repository, even while one is selected.
 */
export const load: PageServerLoad = async ({ url }) => {
  const repo = url.searchParams.get("repo")?.trim() || null;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const config = await getConfig();
  const repos = configuredRepoSlugs(config);
  const insights = await loadInsights({ repo, from, to });
  return {
    insights,
    repos,
    repo,
    repoKnown: repo === null || repos.includes(repo),
  };
};
