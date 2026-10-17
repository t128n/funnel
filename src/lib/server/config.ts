import { loadConfig } from "c12";
import * as v from "valibot";

// `owner/name` on GitHub. Owner segments are alphanumerics/hyphens; repo names
// additionally allow dots and underscores. Kept intentionally permissive here
// (GitHub is the source of truth) but strict enough to reject junk.
const repoPattern = /^[\w.-]+\/[\w.-]+$/;

const repoName = v.pipe(
  v.string("Repository must be a string"),
  v.trim(),
  v.regex(repoPattern, "Repository must be in `owner/name` form"),
);

/** Non-negative integer with a label used in validation messages. */
const count = (label: string) =>
  v.pipe(
    v.number(`${label} must be a number`),
    v.integer(`${label} must be an integer`),
    v.minValue(0, `${label} must be >= 0`),
  );

/**
 * Defaults mirror `docs/SPEC.md` §4.1 and §10.1. These are merged in at the
 * lowest priority by c12 *before* validation, so the schema can require the
 * fully-resolved shape while a config file only specifies what it overrides.
 */
export const DEFAULT_CONFIG = {
  github: {
    url: "https://github.com",
    api_url: "https://api.github.com",
  },
  repos: [] as string[],
  intake: {},
  sync: {
    history_days: 90,
    poll_interval_active_seconds: 30,
    poll_interval_idle_seconds: 300,
  },
  board: {
    done_days: 14,
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
      v.array(repoName),
      v.minLength(1, "At least one repository is required"),
      v.transform((repos) => [...new Set(repos)]),
    ),
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
    }),
    session: v.object({
      idle_days: count("session.idle_days"),
    }),
  }),
  v.check(
    (config) =>
      !config.intake.default_repo ||
      config.repos.includes(config.intake.default_repo),
    "intake.default_repo must be one of the configured repos",
  ),
);

export type FunnelConfig = v.InferOutput<typeof configSchema>;

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
