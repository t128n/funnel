import type { FunnelConfig } from "#/lib/server/config";

/**
 * Minimal valid config so config-dependent code (the GitHub App clients,
 * passthrough link rewriting, and route `html_url` fallbacks) works in tests
 * without writing settings to the database. Defaults match the Cloud hosts, so
 * existing expectations stay on `github.com` / `api.github.com`.
 *
 * Seed it with `setConfig(TEST_CONFIG)` from a `beforeEach`: `config.test.ts`
 * calls `resetConfigCache()`, so a one-time seed in the preload can be dropped
 * between files.
 */
export const TEST_CONFIG: FunnelConfig = {
  github: { url: "https://github.com", api_url: "https://api.github.com" },
  repos: [{ repo: "orgA/core", shortcode: "CORE" }],
  projects: [],
  labels: { prefix: "" },
  intake: {},
  sync: {
    history_days: 90,
    poll_interval_active_seconds: 30,
    poll_interval_idle_seconds: 300,
  },
  board: { done_days: 14, wip_limits: {} },
  session: { idle_days: 30 },
  notifications: { enabled: true, native: true, new_intake: true },
  planning: {
    size_minutes: { sm: 120, md: 240, lg: 480 },
    allocation_percent: 60,
    cycle_weeks: 2,
    cycle_anchor: "2024-01-01",
    maintainers: [],
  },
};

/** A GitHub Enterprise config for exercising the dynamic host wiring. */
export const GHE_CONFIG: FunnelConfig = {
  ...TEST_CONFIG,
  github: { url: "https://acme.ghe.com", api_url: "https://acme.ghe.com/api/v3" },
};
