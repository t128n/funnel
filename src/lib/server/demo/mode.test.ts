import { afterEach, describe, expect, test } from "bun:test";
import { demoModeEnabled, isDemoMode } from "./mode";
import {
  DEMO_EXTRA_LABELS,
  DEMO_REPO_SLUGS,
  DEMO_USERS,
} from "./profile";

describe("demoModeEnabled", () => {
  test("test_truthy", () => {
    expect(demoModeEnabled("1", true)).toBe(true);
    expect(demoModeEnabled(" true ", true)).toBe(true);
    expect(demoModeEnabled("YES", true)).toBe(true);
  });

  test("test_falsy", () => {
    expect(demoModeEnabled(undefined, true)).toBe(false);
    expect(demoModeEnabled("", true)).toBe(false);
    expect(demoModeEnabled("0", true)).toBe(false);
    expect(demoModeEnabled("false", true)).toBe(false);
    expect(demoModeEnabled("no", true)).toBe(false);
  });

  test("test_dev_gate", () => {
    expect(demoModeEnabled("1", false)).toBe(false);
  });
});

describe("isDemoMode", () => {
  afterEach(() => {
    delete process.env.FUNNEL_DEMO;
  });

  test("test_is_demo_reads_process", () => {
    expect(isDemoMode()).toBe(false);
    process.env.FUNNEL_DEMO = "1";
    expect(isDemoMode()).toBe(true);
  });
});

describe("demo profile", () => {
  test("test_profile", () => {
    expect(DEMO_REPO_SLUGS).toEqual(["demo/funnel", "demo/platform"]);
    expect(DEMO_USERS[0]).toEqual({
      externalId: "1001",
      login: "demo",
      name: "Riley Demo",
    });
    const extras = DEMO_EXTRA_LABELS.map((label) => label.name);
    expect(extras).toEqual(
      expect.arrayContaining(["frontend", "backend", "docs", "infra"]),
    );
  });
});
