import { describe, expect, test } from "bun:test";
import { issueKey, repoShortcode } from "#lib/repo-shortcode";

describe("repoShortcode", () => {
  test("is deterministic for the same slug", () => {
    expect(repoShortcode("t128n/funnel-issue-tracker")).toBe(
      repoShortcode("t128n/funnel-issue-tracker"),
    );
  });

  test("uses the repo-name initials", () => {
    expect(repoShortcode("t128n/funnel-issue-tracker")).toStartWith("FIT");
  });

  test("uses the leading letters for a single-word repo", () => {
    expect(repoShortcode("acme/web")).toStartWith("WEB");
  });

  test("keeps similar repos distinct despite shared initials", () => {
    const slugs = [
      "t128n/funnel-issue-tracker",
      "t128n/funnel-internal-tools",
      "acme/foo-it-tracker",
    ];
    const codes = slugs.map(repoShortcode);
    expect(new Set(codes).size).toBe(slugs.length);
  });

  test("matches the shortcode format", () => {
    expect(repoShortcode("t128n/funnel-issue-tracker")).toMatch(/^[A-Z0-9]{3,6}$/);
  });
});

describe("issueKey", () => {
  test("appends the number to the repo shortcode", () => {
    expect(issueKey("t128n/funnel-issue-tracker", 12)).toMatch(/^[A-Z0-9]{3,6}-12$/);
  });
});
