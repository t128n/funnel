import { describe, expect, test } from "bun:test";
import { openBrowser } from "./browser";

describe("openBrowser", () => {
  test("refuses values that are not http(s) URLs", async () => {
    expect(await openBrowser("")).toBe(false);
    expect(await openBrowser("# 32-byte encryption secret/onboarding")).toBe(
      false,
    );
    expect(await openBrowser("C:\\Users\\Torben\\funnel.env")).toBe(false);
  });
});
