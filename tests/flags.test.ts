import { describe, expect, test } from "bun:test";
import { COMMENT_UI_COOKIE, parseCommentUi } from "#lib/comment-ui";
import { commentBubbles } from "#lib/server/flags";

describe("commentBubbles flag", () => {
  test("defaults to the compact list", async () => {
    expect(await commentBubbles(null)).toBe(false);
  });

  test("enables chat bubbles when the context asks for them", async () => {
    expect(await commentBubbles("bubbles")).toBe(true);
  });

  test("stays off for an explicit compact choice", async () => {
    expect(await commentBubbles("compact")).toBe(false);
  });
});

describe("parseCommentUi", () => {
  test("accepts the two known values", () => {
    expect(parseCommentUi("compact")).toBe("compact");
    expect(parseCommentUi("bubbles")).toBe("bubbles");
  });

  test("rejects anything else", () => {
    expect(parseCommentUi(null)).toBeNull();
    expect(parseCommentUi("")).toBeNull();
    expect(parseCommentUi("Bubbles")).toBeNull();
  });

  test("exposes a stable cookie name", () => {
    expect(COMMENT_UI_COOKIE).toBe("funnel:comment-ui");
  });
});
