import { describe, expect, test } from "bun:test";
import {
  issuePath,
  parseIssueParams,
  submissionPath,
  viewOf,
} from "#lib/issue-url";

describe("issuePath", () => {
  test("builds a self-describing path per view", () => {
    expect(issuePath("issues", "t128n/funnel-issue-tracker", 7)).toBe(
      "/issues/t128n/funnel-issue-tracker/7",
    );
    expect(issuePath("board", "acme/web", 12)).toBe("/board/acme/web/12");
    expect(issuePath("matrix", "acme/web", 12)).toBe("/matrix/acme/web/12");
    expect(issuePath("inbox", "acme/web", 1)).toBe("/inbox/acme/web/1");
  });

  test("tolerates a slug without an owner", () => {
    expect(issuePath("issues", "web", 3)).toBe("/issues/web//3");
  });
});

describe("submissionPath", () => {
  test("routes staged submissions under the reserved Inbox segment", () => {
    expect(submissionPath("abc123")).toBe("/inbox/submission/abc123");
  });
});

describe("viewOf", () => {
  test("reads the leading segment for base and detail paths", () => {
    expect(viewOf("/issues")).toBe("issues");
    expect(viewOf("/issues/acme/web/7")).toBe("issues");
    expect(viewOf("/matrix/acme/web/12")).toBe("matrix");
    expect(viewOf("/inbox/submission/abc")).toBe("inbox");
  });

  test("returns null outside the cockpit views", () => {
    expect(viewOf("/login")).toBeNull();
    expect(viewOf("/")).toBeNull();
  });
});

describe("parseIssueParams", () => {
  test("joins owner/repo and coerces the number", () => {
    expect(
      parseIssueParams({ owner: "acme", repo: "web", number: "12" }),
    ).toEqual({ repo: "acme/web", number: 12 });
  });

  test("rejects missing, non-numeric, and non-positive numbers", () => {
    expect(parseIssueParams({ owner: "acme", repo: "web" })).toBeNull();
    expect(parseIssueParams({ owner: "acme", repo: "web", number: "x" })).toBeNull();
    expect(parseIssueParams({ owner: "acme", repo: "web", number: "0" })).toBeNull();
    expect(parseIssueParams({ owner: "acme", repo: "web", number: "-1" })).toBeNull();
  });
});
