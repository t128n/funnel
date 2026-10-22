import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import { stateWorkNote } from "#lib/server/db/schema";
import type { UserRef } from "#lib/server/issues/types";
import {
  createWorkNote,
  deleteWorkNote,
  getWorkNote,
  listWorkNotes,
  updateWorkNote,
  workNoteTarget,
} from "./work-notes";

const AUTHOR: UserRef = {
  externalId: "7",
  forge: "github",
  instance: "github.com",
  login: "octocat",
  avatarUrl: "https://avatars/octocat.png",
};

test("durable author records carry an external identity", () => {
  const author: UserRef = {
    externalId: "101",
    forge: "github",
    instance: "github.com",
    login: "octocat",
    avatarUrl: "",
  };
  expect(author.externalId).toBe("101");
});

function create(body: string, issueNumber = 1): string {
  return createWorkNote({
    org: "notes-org",
    name: "notes-repo",
    issueNumber,
    author: AUTHOR,
    body,
  }).id;
}

beforeEach(() => {
  db.delete(stateWorkNote).run();
});

describe("work notes store", () => {
  test("persists a note and snapshots the author", () => {
    const note = createWorkNote({
      org: "notes-org",
      name: "notes-repo",
      issueNumber: 5,
      author: AUTHOR,
      body: "  internal only  ",
    });

    expect(note.id).toHaveLength(36);
    expect(note.author).toEqual(AUTHOR);
    expect(note.body).toBe("  internal only  ");
    expect(getWorkNote(note.id)?.body).toBe("  internal only  ");
  });

  test("records a null author when no identity is available", () => {
    const note = createWorkNote({
      org: "notes-org",
      name: "notes-repo",
      issueNumber: 5,
      author: null,
      body: "anonymous",
    });
    expect(note.author).toBeNull();
  });

  test("lists notes oldest first and scopes them to the issue", () => {
    const first = create("first");
    const second = create("second");
    create("other issue", 2);

    const notes = listWorkNotes("notes-org", "notes-repo", 1);
    expect(notes.map((n) => n.id)).toEqual([first, second]);
    expect(listWorkNotes("notes-org", "notes-repo", 2)).toHaveLength(1);
    expect(listWorkNotes("notes-org", "other-repo", 1)).toHaveLength(0);
  });

  test("updates the body and returns undefined for a missing id", () => {
    const id = create("before");
    const updated = updateWorkNote(id, "after");
    expect(updated?.body).toBe("after");
    expect(getWorkNote(id)?.body).toBe("after");
    expect(updateWorkNote("nope", "x")).toBeUndefined();
  });

  test("deletes a note and reports whether a row was removed", () => {
    const id = create("bye");
    expect(deleteWorkNote(id)).toBe(true);
    expect(deleteWorkNote(id)).toBe(false);
    expect(getWorkNote(id)).toBeUndefined();
  });

  test("reports the issue a note belongs to", () => {
    const id = create("publish me");
    expect(workNoteTarget(id)).toEqual({
      org: "notes-org",
      name: "notes-repo",
      issueNumber: 1,
    });
    expect(workNoteTarget("nope")).toBeUndefined();
  });
});
