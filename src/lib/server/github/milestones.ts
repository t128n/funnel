/**
 * GitHub milestone reads (and the one create used by the issue picker).
 *
 * GitHub scopes a milestone to a single repository, so this module is
 * deliberately repo-scoped — there is no cross-repo milestone concept. Funnel
 * mirrors the set for the read-only cockpit and only ever creates a milestone
 * lazily, when the Inspector assigns one that a repo does not have yet.
 *
 * Reads run with the App installation token (background sync); the create path
 * runs with the signed-in user's token so GitHub enforces repository
 * permissions natively (SPEC §8).
 */
import type { GitHubProvider } from "#/lib/server/forge/providers.server";

const PER_PAGE = 100;

/** A milestone as mirrored from GitHub (repo-scoped, resolved dates). */
export interface RepoMilestone {
  number: number;
  externalId: string;
  title: string;
  description: string;
  /** `open` | `closed`. */
  state: string;
  dueOn: number | null;
  openIssues: number;
  closedIssues: number;
  creator: { externalId: string; login: string; avatarUrl: string } | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  htmlUrl: string;
}

/** The subset of the REST milestone payload this module reads. */
interface RestMilestone {
  id?: number | null;
  number?: number | null;
  title?: string | null;
  description?: string | null;
  state?: string | null;
  due_on?: string | null;
  open_issues?: number | null;
  closed_issues?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  closed_at?: string | null;
  html_url?: string | null;
  creator?: {
    id?: number | null;
    login?: string | null;
    avatar_url?: string | null;
  } | null;
}

function ms(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Normalize a REST milestone to a {@link RepoMilestone}. */
export function toRepoMilestone(raw: RestMilestone): RepoMilestone {
  const creator = raw.creator;
  return {
    number: typeof raw.number === "number" ? raw.number : 0,
    externalId: String(raw.id ?? 0),
    title: raw.title ?? "",
    description: raw.description ?? "",
    state: raw.state ?? "open",
    dueOn: ms(raw.due_on),
    openIssues: raw.open_issues ?? 0,
    closedIssues: raw.closed_issues ?? 0,
    creator:
      creator &&
      typeof creator.id === "number" &&
      typeof creator.login === "string"
        ? {
            externalId: String(creator.id),
            login: creator.login,
            avatarUrl: creator.avatar_url ?? "",
          }
        : null,
    createdAt: ms(raw.created_at) ?? 0,
    updatedAt: ms(raw.updated_at) ?? 0,
    closedAt: ms(raw.closed_at),
    htmlUrl: raw.html_url ?? "",
  };
}

/**
 * Walk paginated `GET /repos/{owner}/{repo}/milestones` through the provider's
 * raw request, because `forges`' `Milestone` drops the counts, creator and
 * timestamps the cockpit needs. `state=all` returns both open and closed
 * milestones, newest due first.
 */
export async function listRepoMilestones(
  provider: GitHubProvider,
  owner: string,
  repo: string,
): Promise<RepoMilestone[]> {
  const all: RepoMilestone[] = [];
  for (let page = 1; ; page++) {
    const { data } = await provider.request<RestMilestone[]>(
      "GET",
      `/repos/${owner}/${repo}/milestones`,
      {
        query: {
          state: "all",
          sort: "due_on",
          direction: "desc",
          per_page: PER_PAGE,
          page,
        },
      },
    );
    const items = Array.isArray(data) ? data : [];
    all.push(...items.map(toRepoMilestone));
    if (items.length < PER_PAGE) break;
  }
  return all;
}

export interface CreateMilestoneInput {
  title: string;
  description?: string;
  /** ISO date (`YYYY-MM-DD`) or `null` to clear. */
  dueOn?: string | null;
}

/**
 * Create one repo milestone with the signed-in user's token. Returns the
 * normalized record so the caller can refresh the mirror without a re-read.
 */
export async function createRepoMilestone(
  provider: GitHubProvider,
  owner: string,
  repo: string,
  input: CreateMilestoneInput,
): Promise<RepoMilestone> {
  const { data } = await provider.request<RestMilestone>(
    "POST",
    `/repos/${owner}/${repo}/milestones`,
    {
      body: {
        title: input.title,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.dueOn ? { due_on: input.dueOn } : {}),
      },
    },
  );
  return toRepoMilestone(data);
}
