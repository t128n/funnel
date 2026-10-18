import { describe, expect, test } from "bun:test";
import { FEATURE_FLAGS } from "#lib/features";
import {
  COMMENT_BUBBLES_FLAG,
  flagDefault,
  resolveFeatures,
} from "#lib/server/flags";

describe("flagDefault", () => {
  test("maps FUNNEL_COMMENT_UI onto the comment flag", () => {
    // `tests/setup.ts` mocks FUNNEL_COMMENT_UI as "compact".
    expect(flagDefault(COMMENT_BUBBLES_FLAG)).toBe(false);
  });

  test("falls back to false for an unknown key", () => {
    expect(flagDefault("not-a-flag")).toBe(false);
  });
});

describe("resolveFeatures", () => {
  test("resolves every registered flag", async () => {
    const features = await resolveFeatures();
    expect(Object.keys(features).sort()).toEqual(
      FEATURE_FLAGS.map((flag) => flag.key).sort(),
    );
  });

  test("uses the instance default when there is no override", async () => {
    expect((await resolveFeatures())[COMMENT_BUBBLES_FLAG]).toBe(false);
  });

  test("honours a browser override", async () => {
    expect(
      (await resolveFeatures({ [COMMENT_BUBBLES_FLAG]: true }))[
        COMMENT_BUBBLES_FLAG
      ],
    ).toBe(true);
  });
});
