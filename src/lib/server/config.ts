/**
 * Instance configuration (SPEC §4, §10).
 *
 * Configuration is assembled from two sources and validated as one:
 *
 *  - the GitHub hosts (`github.url` / `github.api_url`) come from the
 *    environment, because they are tied to the deployed GitHub App and its
 *    OAuth wiring (`src/env.ts` reads `GITHUB_URL` /
 *    `GITHUB_API_URL`);
 *  - everything else (repositories, projects, intake, sync cadence, board, and
 *    session) lives in the SQLite `state_setting` table and is edited from the
 *    `/settings` page via `#lib/server/settings`.
 *
 * {@link loadFunnelConfig} merges both, normalizes list entries, and runs the
 * cross-field checks. {@link getConfig} is the process-wide cached accessor
 * that every consumer already uses.
 */
import { GITHUB_API_URL, GITHUB_URL } from "$app/env/private";
import * as v from "valibot";
import { deriveRepoShortcode } from "#lib/issue-ref";
import {
  attentionInput,
  count,
  DEFAULT_ATTENTION,
  labelPrefix,
  planningInput,
  projectInput,
  readSettings,
  repoEntry,
  repoName,
  type ProjectInput,
  type RepoInput,
  type SettingsInput,
  WIP_STAGES,
} from "#lib/server/settings/store";

/** One configured repository and the short key used in issue identifiers. */
export interface RepoConfig {
  /** `owner/name` as it appears on GitHub. */
  repo: string;
  /** Uppercase project prefix, e.g. `FIT` in `FIT-12`. */
  shortcode: string;
}

/**
 * One configured project, matched against an issue's GitHub labels. A project
 * indicator is any label; e.g. issues carrying `project1` can be sectioned
 * under `Project One` in the group-by-project view.
 */
export interface ProjectConfig {
  /** GitHub label that marks an issue as belonging to the project. */
  label: string;
  /** Human display name; defaults to `label` when omitted. */
  name: string;
}

function normalizeProjects(entries: ProjectInput[]): ProjectConfig[] {
  const seen = new Set<string>();
  const projects: ProjectConfig[] = [];
  for (const entry of entries) {
    const label = typeof entry === "string" ? entry : entry.label;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const explicit = typeof entry === "string" ? undefined : entry.name;
    projects.push({ label, name: explicit?.length ? explicit : label });
  }
  return projects;
}

function normalizeRepos(entries: RepoInput[]): RepoConfig[] {
  const seen = new Set<string>();
  const repos: RepoConfig[] = [];
  for (const entry of entries) {
    const repo = typeof entry === "string" ? entry : entry.repo;
    const key = repo.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const explicit = typeof entry === "string" ? undefined : entry.shortcode;
    repos.push({
      repo,
      shortcode: (explicit ?? deriveRepoShortcode(repo)).toUpperCase(),
    });
  }
  return repos;
}

export const configSchema = v.pipe(
  v.object({
    github: v.object({
      url: v.pipe(v.string(), v.url("github.url must be a valid URL")),
      api_url: v.pipe(v.string(), v.url("github.api_url must be a valid URL")),
    }),
    /**
     * Repositories are optional at the schema level: a fresh install starts
     * with none and is configured from `/settings`. A missing repository just
     * means nothing is synced until one is added.
     */
    repos: v.pipe(v.array(repoEntry), v.transform(normalizeRepos)),
    /**
     * Optional project indicators. Each entry maps a GitHub label to a display
     * name; omitted means no project grouping is available in the cockpit.
     */
    projects: v.pipe(v.array(projectInput), v.transform(normalizeProjects)),
    /** Global prefix for the reserved-label vocabulary (empty = unprefixed). */
    labels: v.object({ prefix: labelPrefix }),
    intake: v.object({
      default_repo: v.optional(repoName),
    }),
    sync: v.object({
      history_days: count("sync.history_days"),
      poll_interval_active_seconds: count("sync.poll_interval_active_seconds"),
      poll_interval_idle_seconds: count("sync.poll_interval_idle_seconds"),
      /** Opt-in automatic transitions from linked pull request activity. */
      pr_in_review: v.optional(
        v.boolean("sync.pr_in_review must be a boolean"),
        false,
      ),
      pr_done: v.optional(v.boolean("sync.pr_done must be a boolean"), false),
    }),
    board: v.object({
      done_days: count("board.done_days"),
      /**
       * Optional per-stage Work-in-Progress caps, keyed by the open status
       * names. A missing entry means "no limit". Done is never capped.
       */
      wip_limits: v.record(v.picklist(WIP_STAGES), count("board.wip_limits")),
    }),
    session: v.object({
      idle_days: count("session.idle_days"),
    }),
    notifications: v.object({
      enabled: v.boolean("notifications.enabled must be a boolean"),
      native: v.boolean("notifications.native must be a boolean"),
      new_intake: v.boolean("notifications.new_intake must be a boolean"),
    }),
    /** Estimates, cycle shape and the maintainer roster (SPEC §1, §3). */
    planning: planningInput,
    /**
     * Triage thresholds. Optional at the schema boundary (existing stored
     * settings and `setConfig()` literals predate it) but always resolved by a
     * parse, so `getConfig().attention` is a complete object.
     */
    attention: v.optional(attentionInput, DEFAULT_ATTENTION),
  }),
  v.check(
    (config) =>
      new Set(config.repos.map((entry) => entry.shortcode)).size ===
      config.repos.length,
    "Repository shortcodes must be unique (set an explicit shortcode to disambiguate)",
  ),
  v.check(
    (config) =>
      !config.intake.default_repo ||
      config.repos.some((entry) => entry.repo === config.intake.default_repo),
    "intake.default_repo must be one of the configured repos",
  ),
  v.check((config) => {
    const keys = config.planning.maintainers.map(
      (maintainer) =>
        `${maintainer.forge}\u0000${maintainer.instance}\u0000${maintainer.external_id}`,
    );
    return new Set(keys).size === keys.length;
  }, "planning.maintainers must be unique by (forge, instance, external_id)"),
);

export type FunnelConfig = v.InferOutput<typeof configSchema>;

/**
 * Input accepted by {@link setConfig}: the resolved config with an optional
 * attention section, so callers (and older tests) that predate issue #37 keep
 * type-checking. The stored value always has the resolved defaults.
 */
export type FunnelConfigInput = Omit<FunnelConfig, "attention"> & {
  attention?: FunnelConfig["attention"];
};

/** `owner/name` slugs for every configured repository. */
export function configuredRepoSlugs(
  config: Pick<FunnelConfig, "repos">,
): string[] {
  return config.repos.map((entry) => entry.repo);
}

/** Whether `repo` is one of the configured `owner/name` repositories. */
export function isConfiguredRepo(
  config: Pick<FunnelConfig, "repos">,
  repo: string,
): boolean {
  return config.repos.some((entry) => entry.repo === repo);
}

/** `owner/name` → shortcode, for identifier rendering in the cockpit. */
export function repoShortcodeMap(
  config: Pick<FunnelConfig, "repos">,
): Record<string, string> {
  return Object.fromEntries(
    config.repos.map((entry) => [entry.repo, entry.shortcode]),
  );
}

/**
 * Validate a composed settings object against {@link configSchema}, injecting
 * the env-supplied GitHub hosts. Shared by {@link loadFunnelConfig} and the
 * settings write path, so a UI patch is rejected by exactly the same rules
 * (including the cross-field checks) as a startup load.
 *
 * Throws a {@link ConfigError} when the merged config is invalid.
 */
export function validateConfig(settings: SettingsInput): FunnelConfig {
  const merged = {
    github: { url: GITHUB_URL, api_url: GITHUB_API_URL },
    ...settings,
  };

  const parsed = v.safeParse(configSchema, merged);
  if (!parsed.success) {
    throw new ConfigError(
      `Invalid funnel configuration: ${parsed.issues
        .map((issue) => issue.message)
        .join("; ")}`,
      { cause: parsed.issues },
    );
  }
  return parsed.output;
}

/**
 * Load and validate the instance configuration.
 *
 * The GitHub hosts come from the environment; the rest is read from the
 * `state_setting` table (with per-key defaults). The merged object is validated
 * against {@link configSchema}, normalizing list entries and enforcing the
 * cross-field rules.
 *
 * Throws a {@link ConfigError} when the merged config is invalid.
 */
export async function loadFunnelConfig(): Promise<FunnelConfig> {
  return validateConfig(readSettings());
}

let cached: Promise<FunnelConfig> | undefined;

/**
 * Process-wide singleton accessor. Mirrors the lazy `getApp()` pattern used by
 * the GitHub layer so background workers and request handlers share one read.
 *
 * A failed load is *not* cached: a rejected promise is dropped so a later fix
 * (e.g. correcting settings in the UI) takes effect without a restart.
 */
export function getConfig(): Promise<FunnelConfig> {
  if (!cached) {
    cached = loadFunnelConfig().catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
  }
  return cached;
}

/** Drop the cached config (for tests, or after a settings change). */
export function resetConfigCache(): void {
  cached = undefined;
}

/**
 * Seed the cache with an already-validated config, bypassing loading. Lets
 * tests exercise config-dependent code (e.g. the GitHub App's enterprise host)
 * without writing settings rows.
 */
export function setConfig(config: FunnelConfigInput): void {
  cached = Promise.resolve({
    ...config,
    attention: config.attention ?? DEFAULT_ATTENTION,
  });
}

/** Error raised when the funnel configuration fails to load or validate. */
export class ConfigError extends Error {
  override name = "ConfigError";
}
