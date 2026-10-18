import { describe, expect, test } from "bun:test";
import { deriveRepoShortcode, issueRef, repoShortcode } from "./issue-ref";

describe("deriveRepoShortcode", () => {
  test("uses initials for hyphenated repository names", () => {
    expect(deriveRepoShortcode("t128n/funnel-issue-tracker")).toBe("FIT");
  });

  test("uses the repository name for a single word", () => {
    expect(deriveRepoShortcode("orgA/core")).toBe("CORE");
    expect(deriveRepoShortcode("orgA/web")).toBe("WEB");
  });

  test("caps the derived key at six characters", () => {
    expect(deriveRepoShortcode("orgA/extraordinarily-long")).toBe("EL");
  });
});

describe("issueRef", () => {
  test("prefers the configured shortcode", () => {
    const shortcodes = { "t128n/funnel-issue-tracker": "FIT" };
    expect(repoShortcode("t128n/funnel-issue-tracker", shortcodes)).toBe("FIT");
    expect(issueRef("t128n/funnel-issue-tracker", 12, shortcodes)).toBe("FIT-12");
  });

  test("falls back to the derived key for an unmapped repo", () => {
    expect(issueRef("orgA/core", 3, {})).toBe("CORE-3");
  });
});
