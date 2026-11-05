import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#/lib/server/config";
import { forge } from "#/lib/server/forge/providers.server";
import { GHE_CONFIG, TEST_CONFIG } from "#tests/test-config";
import { installationErrorResponse } from "./app.server";

beforeEach(() => {
  setConfig(TEST_CONFIG);
  forge.resetCaches();
});

afterEach(() => {
  forge.resetCaches();
});

describe("installationErrorResponse", () => {
  test("Cloud 404 links to github.com", async () => {
    const res = await installationErrorResponse("acme", "widgets", {
      status: 404,
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      message: "Not synced, open on GitHub",
      html_url: "https://github.com/acme/widgets",
    });
  });

  test("GHES 404 links to the configured web host", async () => {
    setConfig(GHE_CONFIG);

    const res = await installationErrorResponse("acme", "widgets", {
      status: 404,
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      message: "Not synced, open on GitHub",
      html_url: "https://acme.ghe.com/acme/widgets",
    });
  });
});
