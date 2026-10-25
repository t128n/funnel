import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const DEVELOPMENT = new URL(
  "../docs/how-to/contribute/development.md",
  import.meta.url,
);
const CLI = new URL("../docs/reference/cli.md", import.meta.url);
const ENV_EXAMPLE = new URL("../.env.example", import.meta.url);

const development = (): string => readFileSync(DEVELOPMENT, "utf8");
const cli = (): string => readFileSync(CLI, "utf8");
const envExample = (): string => readFileSync(ENV_EXAMPLE, "utf8");

describe("demo documentation", () => {
  test("test_dev_doc", () => {
    const doc = development();
    expect(doc).toContain("bun run dev:demo");
    expect(doc).toContain("--demo");
    expect(doc).toContain("data/demo.db");
    expect(doc).toContain("bun run dev");
    expect(doc).toContain(
      "rm -f data/demo.db data/demo.db-shm data/demo.db-wal",
    );
  });

  test("test_cli_doc", () => {
    expect(cli()).toContain("bun run dev:demo");
  });

  test("test_env_example", () => {
    const env = envExample();
    expect(env).toContain("FUNNEL_DEMO");
    expect(env.toLowerCase()).toContain("production builds ignore");
  });
});
