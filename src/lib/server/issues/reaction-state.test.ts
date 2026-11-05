import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import { stateCommentReaction } from "#lib/server/db/schema";
import {
  listViewerReactions,
  rememberViewerReaction,
} from "./reaction-state";

beforeEach(() => {
  db.delete(stateCommentReaction).run();
});

describe("viewer reaction state", () => {
  test("test_remembers_and_lists_only_the_viewers_rows", () => {
    rememberViewerReaction("u1", "org/core", "500", "+1", true);
    rememberViewerReaction("u1", "org/core", "500", "heart", true);
    rememberViewerReaction("u2", "org/core", "500", "rocket", true);
    rememberViewerReaction("u1", "org/web", "500", "eyes", true);

    const mine = listViewerReactions("u1", "org/core", ["500", "501"]);
    expect(mine.get("500")?.sort()).toEqual(["+1", "heart"]);
    expect(mine.has("501")).toBe(false);
    expect(listViewerReactions("u2", "org/core", ["500"])).toEqual(
      new Map([["500", ["rocket"]]]),
    );
  });

  test("test_removing_a_reaction_is_idempotent", () => {
    rememberViewerReaction("u1", "org/core", "500", "heart", true);
    rememberViewerReaction("u1", "org/core", "500", "heart", false);
    rememberViewerReaction("u1", "org/core", "500", "heart", false);
    expect(listViewerReactions("u1", "org/core", ["500"]).size).toBe(0);
  });

  test("test_empty_page_is_a_no_op", () => {
    expect(listViewerReactions("u1", "org/core", [])).toEqual(new Map());
  });
});
