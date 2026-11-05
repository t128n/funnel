/**
 * Per-IP intake rate limiting (issue #42).
 *
 * Both public entry points (`POST /api/intake` and the `/intake` form action)
 * call {@link checkIntakeRateLimit} before staging anything. The counters are
 * an in-process fixed-window map, which is enough for Funnel's single
 * adapter-node process: restarting the process resets the limits, and a
 * multi-process deployment would give every process its own budget.
 *
 * Every request that reaches the limiter is counted, including malformed,
 * invalid and honeypot attempts, so probing burns the same budget as a real
 * submission. The limits themselves come from the `intake.*` settings and are
 * re-read on every call, so a Settings change takes effect without a restart.
 *
 * Client addresses come from SvelteKit's `event.getClientAddress()`. Behind a
 * reverse proxy that value is only trustworthy when the deployment configures
 * adapter-node's `ADDRESS_HEADER` (and `XFF_DEPTH` for a chain of proxies);
 * otherwise every request appears to come from the proxy and shares one
 * bucket. Never trust a forwarded header without that configuration.
 */
import { readSettings } from "#lib/server/settings/store";

/** A fixed window: one counter per client IP and window start. */
type Window = "minute" | "hour";

interface Bucket {
  count: number;
  /** Exclusive end of the window, unix milliseconds. */
  resetAt: number;
}

export interface IntakeRateLimitAllowed {
  ok: true;
}

export interface IntakeRateLimitBlocked {
  ok: false;
  /** Whole seconds until the longest exceeded window resets, always >= 1. */
  retryAfterSeconds: number;
  /** Stable log-friendly reason, e.g. `rate_limit_minute_and_hour`. */
  reason: string;
}

export type IntakeRateLimitResult =
  | IntakeRateLimitAllowed
  | IntakeRateLimitBlocked;

const WINDOW_MS: Record<Window, number> = {
  minute: 60_000,
  hour: 3_600_000,
};

/** Prune when the map has grown beyond this many entries. */
const PRUNE_THRESHOLD = 512;
/** Also prune periodically so a steady low-volume map stays tidy. */
const PRUNE_EVERY_CALLS = 256;

const buckets = new Map<string, Bucket>();
let callsSincePrune = 0;

/**
 * Remove buckets whose window has already ended. Exported for tests and for
 * `checkIntakeRateLimit`'s opportunistic cleanup.
 */
export function pruneIntakeRateLimitBuckets(now = Date.now()): number {
  let removed = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/** Clear every counter. Intended for tests and a full settings reset. */
export function resetIntakeRateLimits(): void {
  buckets.clear();
  callsSincePrune = 0;
}

/**
 * Resolve the client IP for the limiter. SvelteKit throws when no adapter
 * address is available (and unit tests pass a partial event), so an absent or
 * throwing `getClientAddress` degrades to one shared `unknown` bucket instead
 * of failing the request.
 */
export function intakeClientIp(event: {
  getClientAddress?: () => string;
}): string {
  try {
    const address = event.getClientAddress?.();
    return address && address.length > 0 ? address : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Count one request from `ip` and decide whether it may proceed.
 *
 * Both enabled windows are incremented before the decision, so a blocked
 * request still consumes budget. When several windows are exceeded, the
 * response advertises the longest remaining wait (the hour cap usually wins).
 */
export function checkIntakeRateLimit(
  ip: string,
  now = Date.now(),
): IntakeRateLimitResult {
  callsSincePrune += 1;
  if (callsSincePrune >= PRUNE_EVERY_CALLS || buckets.size > PRUNE_THRESHOLD) {
    pruneIntakeRateLimitBuckets(now);
    callsSincePrune = 0;
  }

  const { rate_limit_per_minute, rate_limit_per_hour } = readSettings().intake;
  const limits: Array<[Window, number]> = [
    ["minute", rate_limit_per_minute],
    ["hour", rate_limit_per_hour],
  ];

  const exceeded: Array<{ window: Window; resetAt: number }> = [];
  for (const [window, limit] of limits) {
    if (limit <= 0) continue;

    const windowMs = WINDOW_MS[window];
    const start = Math.floor(now / windowMs) * windowMs;
    const resetAt = start + windowMs;
    const key = `${ip}\u0000${window}\u0000${start}`;
    const current = buckets.get(key);
    const count = current && current.resetAt === resetAt ? current.count + 1 : 1;
    buckets.set(key, { count, resetAt });

    if (count > limit) exceeded.push({ window, resetAt });
  }

  if (exceeded.length === 0) return { ok: true };

  const longest = exceeded.reduce((a, b) => (b.resetAt > a.resetAt ? b : a));
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((longest.resetAt - now) / 1000)),
    reason: `rate_limit_${exceeded.map((entry) => entry.window).join("_and_")}`,
  };
}
