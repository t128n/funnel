/**
 * Read-only projection of per-repository sync health for Settings → Sync.
 *
 * The mirror row owns the durable health state (`degraded`, `last_polled_at`,
 * `last_reconciled_at`), while the configured repository list is the source of
 * truth for which repositories *should* be mirrored. Joining the two here means
 * a freshly configured repository shows up before its first cycle, with null
 * timestamps, instead of silently disappearing from the page.
 *
 * The last error is deliberately absent: capturing it durably would need a
 * `mirror_repo` column and a migration, so the worker keeps it in structured
 * logs (`repo poll failed`) only.
 */
import { configuredRepoSlugs, getConfig } from "#lib/server/config";
import { forge } from "#lib/server/forge/providers.server";
import { getRepoBySlug } from "./mirror";

export interface SyncRepoStatus {
  /** Configured `owner/name` slug. */
  repo: string;
  /** Epoch ms of the last successful conditional poll, or null before then. */
  lastPolledAt: number | null;
  /** Epoch ms of the last successful nightly reconciliation, or null. */
  lastReconciledAt: number | null;
  /** Durable failure flag set by a failed cycle and cleared by success. */
  degraded: boolean;
  /**
   * Whether a `mirror_repo` row exists yet. A configured repository is
   * unmirrored until its first cycle resolves the installation.
   */
  mirrored: boolean;
}

export interface SyncStatus {
  /** One entry per configured repository, in configuration order. */
  repos: SyncRepoStatus[];
  /** Number of configured repositories currently degraded. */
  degradedCount: number;
  /** When this projection was read (epoch ms). */
  checkedAt: number;
}

/**
 * Join the configured repository list with the disposable mirror rows.
 *
 * A repository without a mirror row is not an error: the first cycle creates
 * the row, so it simply reports null timestamps and a non-degraded state.
 */
export async function syncStatus(now = Date.now()): Promise<SyncStatus> {
  const config = await getConfig();
  const repos = configuredRepoSlugs(config).map((slug) => {
    const slash = slug.indexOf("/");
    const owner = slug.slice(0, slash);
    const name = slug.slice(slash + 1);
    const ref = forge.repoRef(owner, name);
    const row = getRepoBySlug(ref.forge, ref.instance, ref.owner, ref.name);
    return {
      repo: slug,
      lastPolledAt: row?.lastPolledAt ?? null,
      lastReconciledAt: row?.lastReconciledAt ?? null,
      degraded: row?.degraded === 1,
      mirrored: row !== undefined,
    } satisfies SyncRepoStatus;
  });

  return {
    repos,
    degradedCount: repos.filter((repo) => repo.degraded).length,
    checkedAt: now,
  };
}
