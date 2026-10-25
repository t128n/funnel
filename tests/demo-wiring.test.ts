import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getUserAccessToken } from "#lib/server/auth/index";
import { scheduleRefresh } from "#lib/server/issues/http";

const realFetch = globalThis.fetch;
const realDemo = process.env.FUNNEL_DEMO;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realDemo === undefined) delete process.env.FUNNEL_DEMO;
  else process.env.FUNNEL_DEMO = realDemo;
});

describe("demo access token", () => {
  test("test_demo_token", async () => {
    process.env.FUNNEL_DEMO = "1";
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error("network disabled in demo test");
    }) as unknown as typeof fetch;

    expect(await getUserAccessToken("missing")).toBe("demo-token");
    expect(calls).toBe(0);
  });

  test("test_real_token", async () => {
    delete process.env.FUNNEL_DEMO;
    await expect(getUserAccessToken("missing")).rejects.toThrow(
      "No GitHub account linked",
    );
  });
});

describe("demo refresh", () => {
  test("test_refresh_noop", async () => {
    process.env.FUNNEL_DEMO = "1";
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error("network disabled in demo test");
    }) as unknown as typeof fetch;

    scheduleRefresh("demo", "funnel", 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toBe(0);
  });
});

describe("dev script", () => {
  test("test_script", () => {
    const root = process.cwd();
    const pkg = JSON.parse(
      readFileSync(`${root}/package.json`, "utf8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts["dev:demo"]).toBe("bun scripts/dev.ts --demo");

    const source = readFileSync(`${root}/scripts/dev.ts`, "utf8");
    expect(source).toContain("--demo");
    expect(source).toContain("FUNNEL_DEMO");
    expect(source).toContain("./data/demo.db");
    expect(source).toContain("./data/demo-uploads");
    expect(source).toContain(
      "demo-only-secret-0123456789abcdef0123456789abcdef",
    );
    expect(source).toContain("bun");
    expect(source).toContain("--bun");
    expect(source).toContain("vite");
    expect(source).toContain("SIGINT");
    expect(source).toContain("SIGTERM");
  });
});
