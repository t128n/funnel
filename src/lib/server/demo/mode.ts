import { dev } from "$app/env";

/**
 * Values of `FUNNEL_DEMO` that turn demo mode on: `1`, `true`, or `yes`,
 * trimmed and case-insensitive.
 */
const TRUTHY_FLAGS = new Set(["1", "true", "yes"]);

/**
 * Whether demo mode should be active for a given `FUNNEL_DEMO` value.
 *
 * Demo mode is a development-only convenience: a production build
 * (`isDev === false`) ignores the flag entirely so the fake session and
 * seeded data can never be reached from a real deployment.
 */
export function demoModeEnabled(
  flag: string | undefined,
  isDev: boolean,
): boolean {
  if (!isDev) return false;
  return TRUTHY_FLAGS.has(flag?.trim().toLowerCase() ?? "");
}

/**
 * Whether this process is running in demo mode.
 *
 * Reads `FUNNEL_DEMO` on every call (so tests can toggle it) and gates on
 * SvelteKit's compile-time `dev` flag, which is `false` in production builds.
 */
export function isDemoMode(): boolean {
  return demoModeEnabled(process.env.FUNNEL_DEMO, dev);
}
