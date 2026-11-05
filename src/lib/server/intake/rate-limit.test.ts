import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateSetting } from "#lib/server/db/schema";
import {
  checkIntakeRateLimit,
  intakeClientIp,
  pruneIntakeRateLimitBuckets,
  resetIntakeRateLimits,
} from "./rate-limit";

// A fixed instant with clean minute/hour boundaries.
const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

function setLimits(
  values: { minute?: number; hour?: number; honeypot?: boolean } = {},
): void {
  const rows: Array<[string, unknown]> = [
    ["intake.rate_limit_per_minute", values.minute ?? 10],
    ["intake.rate_limit_per_hour", values.hour ?? 60],
    ["intake.honeypot", values.honeypot ?? true],
  ];
  for (const [key, value] of rows) {
    const encoded = JSON.stringify(value);
    db.insert(stateSetting)
      .values({ key, value: encoded, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: stateSetting.key,
        set: { value: encoded, updatedAt: Date.now() },
      })
      .run();
  }
}

function clearLimits(): void {
  for (const key of [
    "intake.rate_limit_per_minute",
    "intake.rate_limit_per_hour",
    "intake.honeypot",
  ]) {
    db.delete(stateSetting).where(eq(stateSetting.key, key)).run();
  }
}

beforeEach(() => {
  clearLimits();
  resetIntakeRateLimits();
});

afterEach(() => {
  clearLimits();
  resetIntakeRateLimits();
});

describe("checkIntakeRateLimit", () => {
  test("allows exactly the per-minute cap and blocks the next request", () => {
    setLimits({ minute: 2, hour: 0 });

    expect(checkIntakeRateLimit("a", T0).ok).toBe(true);
    expect(checkIntakeRateLimit("a", T0 + 1_000).ok).toBe(true);

    const blocked = checkIntakeRateLimit("a", T0 + 2_000);
    expect(blocked).toMatchObject({
      ok: false,
      reason: "rate_limit_minute",
    });
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  test("enforces the per-hour cap", () => {
    setLimits({ minute: 0, hour: 2 });

    expect(checkIntakeRateLimit("a", T0).ok).toBe(true);
    expect(checkIntakeRateLimit("a", T0 + 1_000).ok).toBe(true);

    const blocked = checkIntakeRateLimit("a", T0 + 2_000);
    expect(blocked).toMatchObject({
      ok: false,
      reason: "rate_limit_hour",
    });
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(60);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(3_600);
    }
  });

  test("resets the minute window when the clock crosses the boundary", () => {
    setLimits({ minute: 1, hour: 0 });

    expect(checkIntakeRateLimit("a", T0).ok).toBe(true);
    expect(checkIntakeRateLimit("a", T0 + 1).ok).toBe(false);
    expect(checkIntakeRateLimit("a", T0 + 60_000).ok).toBe(true);
  });

  test("isolates counters per client IP", () => {
    setLimits({ minute: 1, hour: 0 });

    expect(checkIntakeRateLimit("10.0.0.1", T0).ok).toBe(true);
    expect(checkIntakeRateLimit("10.0.0.1", T0 + 1).ok).toBe(false);
    expect(checkIntakeRateLimit("10.0.0.2", T0 + 1).ok).toBe(true);
  });

  test("a zero cap disables that window", () => {
    setLimits({ minute: 0, hour: 0 });

    for (let index = 0; index < 100; index += 1) {
      expect(checkIntakeRateLimit("a", T0 + index).ok).toBe(true);
    }
  });

  test("uses the longer remaining wait when both windows are exceeded", () => {
    setLimits({ minute: 1, hour: 2 });

    expect(checkIntakeRateLimit("a", T0).ok).toBe(true);

    const minuteOnly = checkIntakeRateLimit("a", T0 + 1);
    expect(minuteOnly.ok).toBe(false);
    if (!minuteOnly.ok) {
      expect(minuteOnly.reason).toBe("rate_limit_minute");
      expect(minuteOnly.retryAfterSeconds).toBeLessThanOrEqual(60);
    }

    const both = checkIntakeRateLimit("a", T0 + 2);
    expect(both.ok).toBe(false);
    if (!both.ok) {
      expect(both.reason).toBe("rate_limit_minute_and_hour");
      expect(both.retryAfterSeconds).toBeGreaterThan(60);
    }
  });

  test("never advertises a zero Retry-After at the end of a window", () => {
    setLimits({ minute: 1, hour: 0 });

    expect(checkIntakeRateLimit("a", T0).ok).toBe(true);
    const blocked = checkIntakeRateLimit("a", T0 + 59_999);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBe(1);
  });

  test("prunes expired buckets and the reset helper clears active ones", () => {
    setLimits({ minute: 1, hour: 0 });

    expect(checkIntakeRateLimit("a", T0).ok).toBe(true);
    expect(pruneIntakeRateLimitBuckets(T0 + 3_600_000)).toBeGreaterThan(0);

    // A fresh window still enforces the cap after pruning.
    expect(checkIntakeRateLimit("a", T0 + 3_600_000).ok).toBe(true);
    expect(checkIntakeRateLimit("a", T0 + 3_600_001).ok).toBe(false);

    resetIntakeRateLimits();
    expect(checkIntakeRateLimit("a", T0 + 3_600_002).ok).toBe(true);
  });
});

describe("intakeClientIp", () => {
  test("uses the adapter address and falls back to unknown", () => {
    expect(intakeClientIp({ getClientAddress: () => "203.0.113.7" })).toBe(
      "203.0.113.7",
    );
    expect(intakeClientIp({ getClientAddress: () => "" })).toBe("unknown");
    expect(
      intakeClientIp({
        getClientAddress: () => {
          throw new Error("no adapter address");
        },
      }),
    ).toBe("unknown");
    expect(intakeClientIp({})).toBe("unknown");
  });
});
