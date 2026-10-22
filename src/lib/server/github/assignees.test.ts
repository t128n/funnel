import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { listRepoAssignees } from "./assignees";
import { forge } from "#/lib/server/forge/providers.server";

let actors: Array<{ id: string; login: string; avatarUrl?: string; url?: string }> = [];
let spy: ReturnType<typeof spyOn>;
function fakeProvider() {
  return { repos: { assignableUsers: () => ({ async *[Symbol.asyncIterator]() { for (const a of actors) yield a; } }) } };
}
beforeEach(() => {
  actors = [];
  spy = spyOn(forge, "repoRef").mockReturnValue({ forge: "github", instance: "github.com", owner: "acme", name: "widgets" });
});
afterEach(() => spy.mockRestore());

describe("listRepoAssignees", () => {
  test("maps actors to mirror users", async () => {
    actors = [{ id: "1", login: "octocat", avatarUrl: "https://a/1", url: "https://github.com/octocat" }, { id: "2", login: "hubot" }];
    expect(await listRepoAssignees(fakeProvider() as never, "acme", "widgets")).toEqual([
      {
        id: 0,
        externalId: "1",
        forge: "github",
        instance: "github.com",
        login: "octocat",
        avatarUrl: "https://a/1",
        url: "https://github.com/octocat",
      },
      {
        id: 0,
        externalId: "2",
        forge: "github",
        instance: "github.com",
        login: "hubot",
        avatarUrl: "",
        url: "",
      },
    ]);
  });
  test("skips an actor without an external id", async () => {
    actors = [{ id: "", login: "ghost" }];
    expect(await listRepoAssignees(fakeProvider() as never, "acme", "widgets")).toEqual([]);
  });
});
