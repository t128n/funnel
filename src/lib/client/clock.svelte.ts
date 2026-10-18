/**
 * A shared, live clock so relative-time labels ("2m ago", "1w ago") advance on
 * their own instead of waiting for a data change to re-render.
 *
 * The clock is a coarse tick (60s) rather than a stored timestamp: {@link timeAgo}
 * reads `Date.now()` fresh and only depends on the tick counter, so SSR still
 * renders the real time per request while the client re-renders every minute.
 * The interval is refcounted — it starts with the first subscriber and stops
 * with the last, and is a no-op during SSR.
 */
import { relativeTime } from "#lib/time";

const TICK_MS = 60_000;

let tick = $state(0);
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Relative time that re-evaluates every minute while mounted. Call this from a
 * template (or a `$derived`) so it subscribes to the shared clock.
 */
export function timeAgo(fromMs: number): string {
  tick; // reactive dependency on the shared clock
  return relativeTime(fromMs);
}

/**
 * Subscribe to the shared minute clock. Call this inside a `$derived` when a
 * value depends on wall-clock time (e.g. "today" rolling over at midnight) so
 * it re-evaluates even when no data changes.
 */
export function clockTick(): number {
  return tick;
}

/** Start (or join) the shared clock; returns a stop function. No-op during SSR. */
export function startClock(): () => void {
  if (typeof window === "undefined") return () => {};

  subscribers += 1;
  if (timer === undefined) {
    timer = setInterval(() => {
      tick += 1;
    }, TICK_MS);
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    subscribers -= 1;
    if (subscribers === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
