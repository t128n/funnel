/**
 * Self-healing provisioning of Funnel's canonical reserved labels.
 *
 * SPEC §5.1 fixes the plain-label vocabulary (`backlog`..`blocked`, `p1`-`p3`,
 * `sm`/`md`/`lg`), and SPEC §5.2(4) requires Funnel to create any missing
 * canonical labels across the configured repositories and restore their
 * canonical colors and descriptions. Provisioning runs with the GitHub App
 * installation token (`funnel[bot]`), independent of any signed-in user
 * (SPEC §8), and is idempotent: a converged repo issues zero writes.
 *
 * Only the reserved names in {@link CANONICAL_LABELS} are ever created or
 * patched. Every other label (`bug`, `frontend`, monorepo domain tags, ...)
 * is preserved untouched (SPEC §5.2(5)).
 *
 * Note: writes run through the shared installation Octokit, which includes
 * octokit's throttling plugin (one write per second). A repo missing all 11
 * labels therefore takes roughly ten seconds to converge; converged repos
 * issue zero writes and return immediately.
 */
import { getConfig } from "#/lib/server/config";
import { createLogger } from "#/lib/server/log";
import {
  getInstallationId,
  github,
  type InstallationOctokit,
} from "./app.server";

const log = createLogger({ component: "labels" });

export type LabelGroup = "status" | "priority" | "size";

export interface CanonicalLabel {
  name: string;
  /** Six-digit hex without `#`, the format the GitHub labels API expects. */
  color: string;
  description: string;
  group: LabelGroup;
}

/**
 * The reserved label vocabulary (SPEC §5.1). Colors follow the Oxocarbon
 * semantic mapping in `docs/DESIGN.md`. This is the single source of truth
 * shared by provisioning, the conflict resolver, and the UI pickers.
 */
export const CANONICAL_LABELS: readonly CanonicalLabel[] = [
  // Status (SPEC §5.1). Absence of a status label means "untriaged" (Inbox).
  {
    name: "backlog",
    color: "525252",
    description: "Status: Backlog",
    group: "status",
  },
  { name: "todo", color: "78a9ff", description: "Status: Todo", group: "status" },
  {
    name: "in-progress",
    color: "33b1ff",
    description: "Status: In Progress",
    group: "status",
  },
  {
    name: "in-review",
    color: "be95ff",
    description: "Status: In Review",
    group: "status",
  },
  {
    name: "blocked",
    color: "ee5396",
    description: "Status: Blocked",
    group: "status",
  },
  // Priority. Absence means "no priority".
  {
    name: "p1",
    color: "ee5396",
    description: "Priority: 1 (critical)",
    group: "priority",
  },
  {
    name: "p2",
    color: "FF6F00",
    description: "Priority: 2 (high)",
    group: "priority",
  },
  {
    name: "p3",
    color: "42be65",
    description: "Priority: 3 (normal)",
    group: "priority",
  },
  // Size. Absence means "unestimated".
  { name: "sm", color: "42be65", description: "Size: Small", group: "size" },
  { name: "md", color: "3ddbd9", description: "Size: Medium", group: "size" },
  { name: "lg", color: "ff7eb6", description: "Size: Large", group: "size" },
];

/** Per-repo outcome of a provisioning pass. */
export interface ProvisionSummary {
  created: string[];
  updated: string[];
  unchanged: string[];
}

/** Aggregate outcome across every configured repository. */
export interface ProvisionReport {
  repos: Array<{ repo: string; summary?: ProvisionSummary; error?: string }>;
  created: number;
  updated: number;
  /** Repositories that could not be provisioned (app not installed, etc.). */
  failed: number;
}

interface RepoLabel {
  name: string;
  color: string;
  description: string | null;
}

const PER_PAGE = 100;

/** Prefer "404 Not Found"-style text; Octokit errors carry a `status`. */
function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  return typeof status === "number" ? `${status} ${message}`.trim() : message;
}

/** Walk paginated `GET /repos/{owner}/{repo}/labels` until a short page. */
async function listRepoLabels(
  octokit: InstallationOctokit,
  owner: string,
  repo: string,
): Promise<RepoLabel[]> {
  const all: RepoLabel[] = [];
  for (let page = 1; ; page++) {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/labels", {
      owner,
      repo,
      per_page: PER_PAGE,
      page,
    });
    const items = data as unknown as RepoLabel[];
    all.push(...items);
    if (items.length < PER_PAGE) break;
  }
  return all;
}

/**
 * Reconcile one repository's reserved labels. Creates missing labels and
 * patches any whose color/description drifted from canonical. Returns the
 * names touched (or already correct).
 */
export async function provisionRepoLabels(
  owner: string,
  repo: string,
  labels: readonly CanonicalLabel[] = CANONICAL_LABELS,
): Promise<ProvisionSummary> {
  const installationId = await getInstallationId(owner, repo);
  const octokit = await github.asInstallation(installationId);
  const existing = await listRepoLabels(octokit, owner, repo);
  // GitHub label names are case-insensitive; index them that way.
  const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l]));

  const summary: ProvisionSummary = { created: [], updated: [], unchanged: [] };

  for (const label of labels) {
    const current = byName.get(label.name.toLowerCase());

    if (!current) {
      await octokit.request("POST /repos/{owner}/{repo}/labels", {
        owner,
        repo,
        name: label.name,
        color: label.color,
        description: label.description,
      });
      summary.created.push(label.name);
      continue;
    }

    const colorDrift = current.color.toLowerCase() !== label.color.toLowerCase();
    const descriptionDrift = (current.description ?? "") !== label.description;
    if (colorDrift || descriptionDrift) {
      // Patch under the existing spelling so GitHub matches the label.
      await octokit.request("PATCH /repos/{owner}/{repo}/labels/{name}", {
        owner,
        repo,
        name: current.name,
        color: label.color,
        description: label.description,
      });
      summary.updated.push(label.name);
      continue;
    }

    summary.unchanged.push(label.name);
  }

  return summary;
}

/**
 * Provision every repository in `funnel.config.yaml` (SPEC §5.2(4)).
 *
 * Never throws: a repository that fails (App not installed, permissions,
 * network) is recorded and skipped so the remaining repos still reconcile,
 * and a config-load failure logs a warning. This keeps the SvelteKit `init`
 * hook — which awaits this — from blocking or crashing startup.
 */
export async function provisionCanonicalLabels(): Promise<ProvisionReport> {
  const report: ProvisionReport = {
    repos: [],
    created: 0,
    updated: 0,
    failed: 0,
  };

  let repos: readonly string[];
  try {
    repos = (await getConfig()).repos;
  } catch (error) {
    log.warn({ err: errorMessage(error) }, "provisioning skipped");
    return report;
  }

  log.info({ repos: repos.length }, "label provisioning started");

  for (const entry of repos) {
    const slash = entry.indexOf("/");
    const owner = entry.slice(0, slash);
    const repo = entry.slice(slash + 1);
    try {
      const summary = await provisionRepoLabels(owner, repo);
      report.created += summary.created.length;
      report.updated += summary.updated.length;
      report.repos.push({ repo: entry, summary });
      log.info(
        {
          repo: entry,
          created: summary.created.length,
          updated: summary.updated.length,
          unchanged: summary.unchanged.length,
        },
        "repo labels reconciled",
      );
    } catch (error) {
      report.failed += 1;
      const message = errorMessage(error);
      report.repos.push({ repo: entry, error: message });
      log.warn({ repo: entry, err: message }, "provisioning failed");
    }
  }

  log.info(
    {
      repos: report.repos.length,
      created: report.created,
      updated: report.updated,
      failed: report.failed,
    },
    "label provisioning finished",
  );

  return report;
}
