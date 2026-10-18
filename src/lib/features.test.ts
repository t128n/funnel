import { describe, expect, test } from "bun:test";
import {
  FEATURES_COOKIE,
  parseFeatureOverrides,
  serializeFeatureOverrides,
} from "./features";

describe("parseFeatureOverrides", () => {
  test("returns an empty map for missing or empty input", () => {
    expect(parseFeatureOverrides(null)).toEqual({});
    expect(parseFeatureOverrides(undefined)).toEqual({});
    expect(parseFeatureOverrides("")).toEqual({});
  });

  test("reads known flags with boolean values", () => {
    expect(
      parseFeatureOverrides('{"comment-bubbles":true}'),
    ).toEqual({ "comment-bubbles": true });
  });

  test("decodes a percent-encoded cookie value", () => {
    const encoded = encodeURIComponent('{"comment-bubbles":true}');
    expect(parseFeatureOverrides(encoded)).toEqual({ "comment-bubbles": true });
  });

  test("drops unknown keys and non-boolean values", () => {
    expect(
      parseFeatureOverrides('{"comment-bubbles":"yes","other":true,"n":3}'),
    ).toEqual({});
  });

  test("degrades malformed input to an empty map", () => {
    expect(parseFeatureOverrides("not json")).toEqual({});
    expect(parseFeatureOverrides("[1,2,3]")).toEqual({});
    expect(parseFeatureOverrides("null")).toEqual({});
  });
});

describe("serializeFeatureOverrides", () => {
  test("round-trips through the cookie value", () => {
    const overrides = { "comment-bubbles": true };
    expect(parseFeatureOverrides(serializeFeatureOverrides(overrides))).toEqual(
      overrides,
    );
  });

  test("exposes a stable cookie name", () => {
    expect(FEATURES_COOKIE).toBe("funnel:features");
  });
});
