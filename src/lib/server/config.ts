import { loadConfig } from "c12";
import * as v from "valibot";
import { deriveRepoShortcode } from "#lib/issue-ref";

// `owner/name` on GitHub. Owner segments are alphanumerics/hyphens; repo names
// additionally allow dots and underscores. Kept intentionally permissive here
// (GitHub is the source of truth) but strict enough to reject junk.
const repoPattern = /^[\w.-]+\/[\w.-]+$/;

const repoName = v.pipe(
  v.string("Repository must be a string"),
  v.trim(),
  v.regex(repoPattern, "Repository must be in `owner/name` form"),
);

// The short project key shown on cards (e.g. `FIT-12`). Kept short because it
// repeats on every card; owners can override the derived value in config.
const shortcode = v.pipe(
  v.string("Shortcode must be a string"),
  v.trim(),
  v.regex(
    /^[A-Za-z][A-Za-z0-9]{0,5}$/,
    "Shortcode must start with a letter and be at most 6 characters",
  ),
);

/** Non-negative integer with a label used in validation messages. */
const count = (label: string) =>
  v.pipe(
    v.number(`${label} must be a number`),
    v.integer(`${label} must be an integer`),
    v.minValue(0, `${label} must be >= 0`),
  );

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

/** Raw YAML project entry: the label string or the structured mapping. */
type ProjectInput = string | { label: string; name?: string };

const projectInput = v.union([
  v.pipe(v.string(), v.trim(), v.nonEmpty("Project label must not be empty")),
  v.object({
    label: v.pipe(v.string(), v.trim(), v.nonEmpty("Project label must not be empty")),
    name: v.optional(v.pipe(v.string(), v.trim())),
  }),
]);

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

/** Raw YAML entry: the legacy string form or the structured mapping. */
type RepoInput = string | { repo: string; shortcode?: string };

const repoEntry = v.union([
  repoName,
  v.object({ repo: repoName, shortcode: v.optional(shortcode) }),
]);

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

/**
 * The configuration defaults. These are merged in at the lowest priority by c12
 * *before* validation, so the schema can require the fully-resolved shape while
 * a config file only specifies what it overrides.
 */
export const DEFAULT_CONFIG = {
  github: {
    url: "https://github.com",
    api_url: "https://api.github.com",
  },
  repos: [] as RepoConfig[],
  projects: [] as ProjectConfig[],
  intake: {},
  sync: {
    history_days: 90,
    poll_interval_active_seconds: 30,
    poll_interval_idle_seconds: 300,
  },
  board: {
    done_days: 14,
    wip_limits: {} as Record<string, number>,
  },
  session: {
    idle_days: 30,
  },
};

export const configSchema = v.pipe(
  v.object({
    github: v.object({
      url: v.pipe(v.string(), v.url("github.url must be a valid URL")),
      api_url: v.pipe(v.string(), v.url("github.api_url must be a valid URL")),
    }),
    repos: v.pipe(
      v.array(repoEntry),
      v.minLength(1, "At least one repository is required"),
      v.transform(normalizeRepos),
    ),
    /**
     * Optional project indicators. Each entry maps a GitHub label to a display
     * name; omitted means no project grouping is available in the cockpit.
     */
    projects: v.pipe(v.array(projectInput), v.transform(normalizeProjects)),
    intake: v.object({
      default_repo: v.optional(repoName),
    }),
    sync: v.object({
      history_days: count("sync.history_days"),
      poll_interval_active_seconds: count("sync.poll_interval_active_seconds"),
      poll_interval_idle_seconds: count("sync.poll_interval_idle_seconds"),
    }),
    board: v.object({
      done_days: count("board.done_days"),
      /**
       * Optional per-stage Work-in-Progress caps, keyed by the open status
       * names. A missing entry means "no limit". Done is never capped.
       */
      wip_limits: v.record(
        v.picklist(["backlog", "todo", "in-progress", "in-review"] as const),
        count("board.wip_limits"),
      ),
    }),
    session: v.object({
      idle_days: count("session.idle_days"),
    }),
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
);

export type FunnelConfig = v.InferOutput<typeof configSchema>;

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
 * Load and validate `funnel.config.yaml` from `cwd`.
 *
 * c12 resolves `funnel.config.{yaml,yml,json,jsonc,json5,toml,ts,js,...}`
 * (YAML parsed via its bundled `confbox`), merges {@link DEFAULT_CONFIG} and
 * validates the result against {@link configSchema}.
 *
 * Throws a `ConfigError` when the merged config is invalid.
 */
export async function loadFunnelConfig(
  options: { cwd?: string } = {},
): Promise<FunnelConfig> {
  try {
    const { config } = await loadConfig({
      name: "funnel",
      cwd: options.cwd ?? process.cwd(),
      dotenv: false, // environment variables are owned by `src/env.ts`
      packageJson: false,
      rcFile: false,
      // A missing file is not fatal: `defaults` are merged, then the schema
      // rejects the absence of required `repos` with a readable message.
      configFileRequired: false,
      defaults: DEFAULT_CONFIG,
      schema: configSchema,
    });
    return config as FunnelConfig;
  } catch (error) {
    throw new ConfigError(
      `Invalid funnel configuration: ${(error as Error).message}`,
      { cause: error },
    );
  }
}

let cached: Promise<FunnelConfig> | undefined;

/**
 * Process-wide singleton accessor. Mirrors the lazy `getApp()` pattern used by
 * the GitHub layer so background workers and request handlers share one parse.
 */
export function getConfig(): Promise<FunnelConfig> {
  return (cached ??= loadFunnelConfig());
}

/** Drop the cached config (for tests, or after a config reload). */
export function resetConfigCache(): void {
  cached = undefined;
}

/**
 * Seed the cache with an already-validated config, bypassing file loading.
 * Lets tests exercise config-dependent code (e.g. the GitHub App's enterprise
 * host) without writing a `funnel.config.yaml` to disk.
 */
export function setConfig(config: FunnelConfig): void {
  cached = Promise.resolve(config);
}

/** Error raised when the funnel configuration fails to load or validate. */
export class ConfigError extends Error {
  override name = "ConfigError";
}
