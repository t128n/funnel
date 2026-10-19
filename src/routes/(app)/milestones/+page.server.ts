import { listMilestones } from "#lib/server/issues/queries";
import type { MilestoneItem } from "#lib/server/issues/types";
import type { PageServerLoad } from "./$types";

/**
 * The Milestones view: every mirrored milestone, grouped by repository.
 * GitHub scopes a milestone to one repo, so the grouping is the model's own —
 * a milestone with the same title in two repos is two entries, not one.
 */
export const load: PageServerLoad = async () => {
  const byRepo = new Map<string, MilestoneItem[]>();
  for (const milestone of listMilestones()) {
    const list = byRepo.get(milestone.repo) ?? [];
    list.push(milestone);
    byRepo.set(milestone.repo, list);
  }

  const groups = [...byRepo.entries()]
    .map(([repo, milestones]) => ({ repo, milestones }))
    .sort((a, b) => a.repo.localeCompare(b.repo));

  return { groups };
};
