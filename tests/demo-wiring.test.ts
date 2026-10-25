import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getUserAccessToken } from "#lib/server/auth/index";
import { scheduleRefresh } from "#lib/server/issues/http";
import { devEnvironment } from "../scripts/dev";

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

  test("test_script_blank_env_defaults", () => {
    // `cp .env.example .env` leaves FUNNEL_SECRET= (empty) behind; a blank or
    // whitespace value must take the demo default instead of failing validation.
    const base: NodeJS.ProcessEnv = {
      FUNNEL_DEMO: undefined,
      FUNNEL_SECRET: "",
      FUNNEL_DB: "   ",
      FUNNEL_UPLOAD_DIR: undefined,
    };

    const env = devEnvironment(base, true);

    expect(env).not.toBe(base);
    expect(base.FUNNEL_SECRET).toBe("");
    expect(env.FUNNEL_DEMO).toBe("1");
    expect(env.FUNNEL_SECRET).toBe(
      "demo-only-secret-0123456789abcdef0123456789abcdef",
    );
    expect(env.FUNNEL_SECRET!.length).toBeGreaterThanOrEqual(32);
    expect(env.FUNNEL_DB).toBe("./data/demo.db");
    expect(env.FUNNEL_UPLOAD_DIR).toBe("./data/demo-uploads");
  });

  test("test_script_explicit_env_kept", () => {
    const env = devEnvironment(
      {
        FUNNEL_DB: "./tmp/other.db",
        FUNNEL_UPLOAD_DIR: "./tmp/other-uploads",
        FUNNEL_SECRET: "x".repeat(40),
      },
      true,
    );

    expect(env.FUNNEL_DB).toBe("./tmp/other.db");
    expect(env.FUNNEL_UPLOAD_DIR).toBe("./tmp/other-uploads");
    expect(env.FUNNEL_SECRET).toBe("x".repeat(40));
    expect(env.FUNNEL_DEMO).toBe("1");
  });

  test("test_script_real_mode_untouched", () => {
    const base: NodeJS.ProcessEnv = {
      FUNNEL_SECRET: "",
      FUNNEL_DB: undefined,
    };

    const env = devEnvironment(base, false);

    expect(env).toEqual(base);
    expect(env.FUNNEL_DEMO).toBeUndefined();
  });
});
