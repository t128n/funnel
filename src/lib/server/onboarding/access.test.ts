import { describe, expect, test } from "bun:test";
import { onboardingTokenRequired, resolvePublicOrigin } from "./access";

describe("resolvePublicOrigin", () => {
  test("prefers FUNNEL_URL", () => {
    expect(resolvePublicOrigin(new URL("http://127.0.0.1:5173/x"))).toBe(
      "http://localhost:5173",
    );
  });
});

describe("onboarding token", () => {
  test("is not required when FUNNEL_ONBOARDING_TOKEN is unset", () => {
    // The test env mock leaves the variable undefined.
    expect(onboardingTokenRequired()).toBe(false);
  });
});
